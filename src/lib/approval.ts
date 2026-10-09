import "server-only";
import type { PoolConnection } from "mysql2/promise";
import { db, exec, row, rows, transaction, type Db, type Row } from "./db";
import { UserError, type CurrentUser } from "./auth";
import { approvalTable, type DocType } from "./documents";
import { queueApprovalEmail } from "./email";
import { createChecklistItems } from "./checklist";
import { todayWib } from "./dates";

export interface ApprovalRun {
  id: number;
  document_type: DocType;
  document_id: number;
  requester_id: number;
  cycle: number;
  current_position: number;
  state: "pending" | "revision" | "approved" | "rejected";
  project_id: number | null;
  created_at: string;
}

export interface ApprovalStep {
  run_id: number;
  cycle: number;
  position: number;
  approver_id: number;
  approver_name: string;
  state: "waiting" | "approved" | "rejected" | "revision" | "skipped";
  note: string | null;
  acted_at: string | null;
}

export interface RouteStep {
  position: number;
  approver_id: number;
  approver_name: string;
  username: string;
}

export function approvalRoute(conn: Db, requester: number): Promise<RouteStep[]> {
  return rows<RouteStep>(conn, `SELECT r.position, r.approver_id, u.full_name AS approver_name, u.username
    FROM approval_routes r JOIN users u ON u.id = r.approver_id WHERE r.requester_id = ? ORDER BY r.position`, [requester]);
}

export async function saveApprovalRoute(requester: number, rawIds: string[]): Promise<void> {
  if (rawIds.length === 0 || rawIds.length > 20) throw new UserError("Pilih 1 sampai 20 approver secara berurutan.");
  if (!rawIds.every((id) => /^[1-9][0-9]{0,9}$/.test(id))) throw new UserError("Pilih user untuk setiap tahap.");
  const ids = rawIds.map(Number);
  if (new Set(ids).size !== ids.length || ids.includes(requester)) throw new UserError("Approver tidak boleh berulang atau sama dengan pemohon.");
  await transaction(async (tx) => {
    if (!(await row(tx, "SELECT id FROM users WHERE id = ? FOR UPDATE", [requester]))) throw new UserError("Pemohon tidak ditemukan.");
    for (const id of ids) {
      if (!(await row(tx, "SELECT id FROM users WHERE id = ?", [id]))) throw new UserError("Approver tidak ditemukan.");
    }
    await exec(tx, "DELETE FROM approval_routes WHERE requester_id = ?", [requester]);
    for (const [index, id] of ids.entries()) {
      await exec(tx, "INSERT INTO approval_routes (requester_id, position, approver_id) VALUES (?, ?, ?)", [requester, index + 1, id]);
    }
  });
}

export function approvalRun(conn: Db, type: DocType, id: number, lock = false): Promise<ApprovalRun | null> {
  return row<ApprovalRun>(conn, `SELECT * FROM approval_runs WHERE document_type = ? AND document_id = ?${lock ? " FOR UPDATE" : ""}`, [type, id]);
}

export function approvalSteps(conn: Db, run: ApprovalRun): Promise<ApprovalStep[]> {
  return rows<ApprovalStep>(conn, "SELECT * FROM approval_steps WHERE run_id = ? AND cycle = ? ORDER BY position", [run.id, run.cycle]);
}

async function approvalEvent(tx: PoolConnection, run: ApprovalRun, actor: CurrentUser, action: string, note = "", snapshot: Row | null = null) {
  await exec(tx, "INSERT INTO approval_events (run_id, cycle, actor_id, actor_name, action, note, document_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    run.id, run.cycle, actor.id, actor.full_name, action, note, snapshot === null ? null : JSON.stringify(snapshot),
  ]);
}

// Called inside the same transaction as the document insert or legacy activation.
async function startApproval(tx: PoolConnection, type: DocType, id: number, requester: number, actor: CurrentUser): Promise<void> {
  if (!(await row(tx, "SELECT id FROM users WHERE id = ? FOR UPDATE", [requester]))) throw new UserError("Pemohon tidak ditemukan.");
  const route = await approvalRoute(tx, requester);
  if (route.length === 0) throw new UserError("Jalur approval belum diatur. Minta Admin mengatur jalur Anda di menu Users.");
  await exec(tx, "INSERT INTO approval_runs (document_type, document_id, requester_id) VALUES (?, ?, ?)", [type, id, requester]);
  const run = (await approvalRun(tx, type, id))!;
  for (const step of route) {
    if (step.approver_id === requester) throw new UserError("Pemohon tidak boleh menyetujui dokumen sendiri.");
    await exec(tx, "INSERT INTO approval_steps (run_id, cycle, position, approver_id, approver_name) VALUES (?, 1, ?, ?, ?)", [run.id, step.position, step.approver_id, step.approver_name]);
  }
  const table = approvalTable(type);
  await exec(tx, `UPDATE ${table} SET status_dokumen = 'Diajukan' WHERE id = ?`, [id]);
  await approvalEvent(tx, run, actor, "submit", "", await row(tx, `SELECT * FROM ${table} WHERE id = ?`, [id]));
  await queueApprovalEmail(tx, type, id);
}

export async function canViewApproval(run: ApprovalRun | null, document: Row, user: CurrentUser): Promise<boolean> {
  if (user.role === "Admin" || Number(document.created_by_user_id) === user.id) return true;
  if (!run) return false;
  return Boolean(await row(db, "SELECT 1 FROM approval_steps WHERE run_id = ? AND approver_id = ? LIMIT 1", [run.id, user.id]));
}

export function canActApproval(run: ApprovalRun | null, steps: ApprovalStep[], user: CurrentUser): boolean {
  if (!run || run.state !== "pending" || run.requester_id === user.id) return false;
  const current = steps.find((step) => step.position === run.current_position);
  return current ? current.state === "waiting" && current.approver_id === user.id : false;
}

export function approvalLabel(run: ApprovalRun | null, steps: ApprovalStep[], fallback: string): string {
  if (!run) return ["Draft", "Diajukan", "Diverifikasi"].includes(fallback) ? "Belum memiliki jalur approval" : fallback;
  const labels: Record<string, string> = { revision: "Perlu revisi pemohon", approved: "Disetujui final", rejected: "Ditolak" };
  if (labels[run.state]) return labels[run.state];
  const current = steps.find((step) => step.position === run.current_position);
  return current ? `Menunggu approval ${current.approver_name}` : "Menunggu approval";
}

export async function decideApproval(type: DocType, id: number, user: CurrentUser, action: string, rawNote: string, cycle: number, position: number): Promise<string> {
  if (!["approve", "reject", "revision"].includes(action)) throw new UserError("Tindakan tidak valid.");
  const note = rawNote.trim();
  if ((action !== "approve" && note === "") || [...note].length > 5000) throw new UserError("Catatan wajib untuk penolakan/revisi, maksimal 5.000 karakter.");
  const table = approvalTable(type);
  return transaction(async (tx) => {
    const document = await row(tx, `SELECT * FROM ${table} WHERE id = ? FOR UPDATE`, [id]);
    const run = await approvalRun(tx, type, id, true);
    const steps = run ? await approvalSteps(tx, run) : [];
    if (!document || !run || !canActApproval(run, steps, user)) throw new UserError("Anda tidak memiliki giliran approval untuk dokumen ini.");
    if (cycle !== run.cycle || position !== run.current_position) throw new UserError("Tahap approval sudah berubah. Muat ulang halaman.");
    if (document.status_dokumen !== "Diajukan") throw new UserError("Status dokumen tidak sesuai untuk approval.");
    const state = ({ approve: "approved", reject: "rejected", revision: "revision" } as const)[action as "approve"];
    await exec(tx, "UPDATE approval_steps SET state = ?, note = ?, acted_at = NOW() WHERE run_id = ? AND cycle = ? AND position = ?", [state, note, run.id, cycle, position]);
    await approvalEvent(tx, run, user, action, note);
    if (action === "approve" && position < steps.length) {
      await exec(tx, "UPDATE approval_runs SET current_position = current_position + 1 WHERE id = ?", [run.id]);
      await queueApprovalEmail(tx, type, id);
      return "Persetujuan disimpan dan diteruskan ke approver berikutnya.";
    }
    await exec(tx, "UPDATE approval_runs SET state = ? WHERE id = ?", [state, run.id]);
    await exec(tx, "UPDATE approval_steps SET state = 'skipped' WHERE run_id = ? AND cycle = ? AND state = 'waiting'", [run.id, cycle]);
    const status = ({ approve: "Disetujui", reject: "Ditolak", revision: "Revisi" } as const)[action as "approve"];
    await exec(tx, `UPDATE ${table} SET status_dokumen = ? WHERE id = ?`, [status, id]);
    if (action === "approve") {
      const name = type === "fpa" ? document.nama_aplikasi : document.nama_proyek;
      const number = type === "fpa" ? document.nomor_fpa : document.nomor_fpa_a;
      const description = `Dari Pengajuan ${type === "fpa" ? "FPA" : "FPA-A"} No: ${number}`;
      const project = await exec(tx, "INSERT INTO projects (name, description, category, start_date, status) VALUES (?, ?, 'FPA', ?, 'Active')", [name, description, todayWib()]);
      await exec(tx, "UPDATE approval_runs SET project_id = ? WHERE id = ?", [project.insertId, run.id]);
      await createChecklistItems(tx, type, id, document);
    }
    return { approve: "Disetujui final. Project berhasil dibuat.", reject: "Pengajuan ditolak.", revision: "Pengajuan dikembalikan kepada pemohon untuk direvisi." }[action as "approve"];
  });
}

export async function activateLegacyApproval(type: DocType, id: number, user: CurrentUser): Promise<void> {
  if (user.role !== "Admin") throw new UserError("Hanya Admin yang dapat mengaktifkan jalur dokumen lama.");
  const table = approvalTable(type);
  await transaction(async (tx) => {
    const document = await row(tx, `SELECT * FROM ${table} WHERE id = ? FOR UPDATE`, [id]);
    if (!document || !document.created_by_user_id || !["Draft", "Diajukan", "Diverifikasi"].includes(document.status_dokumen) || (await approvalRun(tx, type, id, true))) {
      throw new UserError("Dokumen ini tidak dapat diaktifkan. Pastikan pemohon tercatat dan dokumen belum selesai.");
    }
    await startApproval(tx, type, id, Number(document.created_by_user_id), user);
  });
}

// Admin may correct the requester's estimated duration while the document is still awaiting a decision;
// the original value the requester wrote is kept untouched in estimasi_durasi/tambahan_waktu.
export async function adjustEstimatedDuration(type: DocType, id: number, newValue: number | null, user: CurrentUser): Promise<string> {
  if (user.role !== "Admin") throw new UserError("Hanya Admin yang dapat mengoreksi estimasi hari.");
  if (newValue !== null && (newValue < 0 || newValue > 99999999)) throw new UserError("Estimasi hari tidak valid.");
  const table = approvalTable(type);
  const originalColumn = type === "fpa" ? "estimasi_durasi" : "tambahan_waktu";
  const adminColumn = type === "fpa" ? "estimasi_durasi_admin" : "tambahan_waktu_admin";
  await transaction(async (tx) => {
    const document = await row(tx, `SELECT * FROM ${table} WHERE id = ? FOR UPDATE`, [id]);
    if (!document) throw new UserError("Dokumen tidak ditemukan.");
    const run = await approvalRun(tx, type, id, true);
    if (!run || run.state !== "pending") throw new UserError("Estimasi hanya dapat dikoreksi selama dokumen masih menunggu approval.");
    const oldEffective = document[adminColumn] ?? document[originalColumn];
    await exec(tx, `UPDATE ${table} SET ${adminColumn} = ? WHERE id = ?`, [newValue, id]);
    const note = `${oldEffective !== null ? `${oldEffective} hari` : "belum dikoreksi"} -> ${newValue !== null ? `${newValue} hari` : "dikembalikan ke estimasi pemohon"}`;
    await approvalEvent(tx, run, user, "adjust_duration", note);
  });
  return "Estimasi hari berhasil dikoreksi.";
}

export async function transitionFpmStatus(id: number, action: string, user: CurrentUser): Promise<string> {
  if (user.role !== "Admin") throw new UserError("Hanya Admin/Developer yang dapat mengubah status laporan FPM.");
  const transitions: Record<string, [string, string, string]> = {
    // The estimate's deadline counts from the moment work starts; the close date is kept for the history list.
    process: ["Open", "In Progress", ", diproses_at = NOW()"],
    close: ["In Progress", "Closed", ", tanggal_selesai = CURDATE()"],
  };
  const transition = transitions[action];
  if (!transition) throw new UserError("Tindakan FPM tidak valid.");
  const [before, after, stamp] = transition;
  const result = await exec(db, `UPDATE fpm_submissions SET status_dokumen = ?${stamp} WHERE id = ? AND status_dokumen = ?`, [after, id, before]);
  if (!result.affectedRows) throw new UserError("Status FPM sudah berubah. Muat ulang halaman.");
  return `Status FPM diperbarui menjadi ${after}.`;
}

// Developer (Admin) estimate of how many days a reported bug takes to fix. Optional, editable while
// the report is Open or In Progress, and null clears it.
export async function setFpmEstimate(id: number, days: number | null, user: CurrentUser): Promise<string> {
  if (user.role !== "Admin") throw new UserError("Hanya Admin/Developer yang dapat mengisi estimasi durasi pengerjaan.");
  if (days !== null && (days < 1 || days > 999)) throw new UserError("Estimasi hari harus berupa angka bulat 1-999, atau dikosongkan.");
  await transaction(async (tx) => {
    const found = await row(tx, "SELECT status_dokumen FROM fpm_submissions WHERE id = ? FOR UPDATE", [id]);
    if (!found) throw new UserError("Laporan FPM tidak ditemukan.");
    if (!["Open", "In Progress"].includes(found.status_dokumen)) throw new UserError("Estimasi tidak dapat diubah setelah laporan ditutup.");
    if (days === null) {
      await exec(tx, "UPDATE fpm_submissions SET estimasi_durasi = NULL, estimasi_diisi_oleh = NULL, estimasi_diisi_at = NULL WHERE id = ?", [id]);
    } else {
      await exec(tx, "UPDATE fpm_submissions SET estimasi_durasi = ?, estimasi_diisi_oleh = ?, estimasi_diisi_at = NOW() WHERE id = ?", [days, user.id, id]);
    }
  });
  return days === null ? "Estimasi durasi pengerjaan dihapus." : "Estimasi durasi pengerjaan disimpan.";
}

export type ListView = "pending" | "mine" | "all" | "board";

export async function approvalList(type: DocType, user: CurrentUser, view: ListView): Promise<Row[]> {
  const table = approvalTable(type);
  const params: (string | number)[] = [type];
  const where: string[] = [];
  if (view === "pending") {
    where.push("r.state = 'pending' AND s.approver_id = ? AND s.state = 'waiting'");
    params.push(user.id);
  } else if (view === "mine") {
    where.push("d.created_by_user_id = ?");
    params.push(user.id);
  } else if (view !== "board" && user.role !== "Admin") {
    // 'board' (used by the shared Task list) is visible to everyone; every other view
    // restricts a non-Admin to documents they requested or are an approver on.
    where.push("(d.created_by_user_id = ? OR EXISTS (SELECT 1 FROM approval_steps visible WHERE visible.run_id = r.id AND visible.approver_id = ?))");
    params.push(user.id, user.id);
  }
  const list = await rows(db, `SELECT d.*, r.state AS workflow_state, s.approver_name AS current_approver
    FROM ${table} d LEFT JOIN approval_runs r ON r.document_type = ? AND r.document_id = d.id
    LEFT JOIN approval_steps s ON s.run_id = r.id AND s.cycle = r.cycle AND s.position = r.current_position
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY d.created_at DESC, d.id DESC`, params);
  const labels: Record<string, string> = { approved: "Disetujui final", rejected: "Ditolak", revision: "Perlu revisi pemohon" };
  return list.map((item) => ({
    ...item,
    approval_label: item.workflow_state === "pending" ? `Menunggu approval ${item.current_approver}` : labels[item.workflow_state ?? ""] ?? approvalLabel(null, [], item.status_dokumen),
  }));
}

export async function pendingApprovalCount(user: CurrentUser): Promise<number> {
  const found = await row(db, `SELECT COUNT(*) AS total FROM approval_runs r
    JOIN approval_steps s ON s.run_id = r.id AND s.cycle = r.cycle AND s.position = r.current_position
    WHERE r.state = 'pending' AND s.state = 'waiting' AND s.approver_id = ?`, [user.id]);
  return Number(found?.total ?? 0);
}

export { startApproval };
