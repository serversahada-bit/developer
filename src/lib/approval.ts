import "server-only";
import type { PoolConnection } from "mysql2/promise";
import { db, exec, row, rows, scalar, transaction, type Db, type Row } from "./db";
import { UserError, type CurrentUser } from "./auth";
import { approvalTable, costColumns, effectiveCost, rupiah, STAGE_LABEL, STAGES, type DocType, type Stage } from "./documents";
import { queueInfoEmails, queueTurnEmails } from "./email";
import { createChecklistItems } from "./checklist";
import { todayWib } from "./dates";
import { parseRupiah } from "./form";
import { findAtasan, karyawanInactive, type Karyawan } from "./identity";
import { isTimIt, MANAGER_ROLE_LABEL, MANAGER_ROLES, timItWhere, type ManagerRole } from "./menus";
import { ensureUserForKaryawan } from "./users";

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

// stage is null on steps of the old per-requester routes. A waiting Tim IT step has no
// approver_id: any Tim IT member decides it, and becomes its approver.
export interface ApprovalStep {
  run_id: number;
  cycle: number;
  position: number;
  stage: Stage | null;
  approver_id: number | null;
  approver_name: string;
  state: "waiting" | "approved" | "rejected" | "revision" | "skipped";
  note: string | null;
  acted_at: string | null;
}

interface Approver {
  id: number;
  full_name: string;
  karyawan_id: number | null;
}

export function approvalRun(conn: Db, type: DocType, id: number, lock = false): Promise<ApprovalRun | null> {
  return row<ApprovalRun>(conn, `SELECT * FROM approval_runs WHERE document_type = ? AND document_id = ?${lock ? " FOR UPDATE" : ""}`, [type, id]);
}

export function approvalSteps(conn: Db, run: ApprovalRun): Promise<ApprovalStep[]> {
  return rows<ApprovalStep>(conn, "SELECT * FROM approval_steps WHERE run_id = ? AND cycle = ? ORDER BY position", [run.id, run.cycle]);
}

async function approvalEvent(tx: PoolConnection, run: ApprovalRun, actor: CurrentUser, action: string, note = "", snapshot: Row | null = null): Promise<number> {
  const result = await exec(tx, "INSERT INTO approval_events (run_id, cycle, actor_id, actor_name, action, note, document_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    run.id, run.cycle, actor.id, actor.full_name, action, note, snapshot === null ? null : JSON.stringify(snapshot),
  ]);
  return result.insertId;
}

// --- Who approves ---------------------------------------------------------------------------

export async function managerHolders(conn: Db): Promise<Partial<Record<ManagerRole, Approver>>> {
  const list = await rows<Approver & { role_key: ManagerRole }>(conn, `SELECT r.role_key, u.id, u.full_name, u.karyawan_id
    FROM approval_roles r JOIN users u ON u.id = r.user_id`);
  return Object.fromEntries(list.map(({ role_key, ...holder }) => [role_key, holder]));
}

export function timItMembers(conn: Db): Promise<Approver[]> {
  return rows<Approver>(conn, `SELECT u.id, u.full_name, u.karyawan_id FROM users u WHERE ${timItWhere("u")} ORDER BY u.full_name`);
}

type AtasanLookup = { karyawan: Karyawan } | { skip: string };
export type AtasanResult = { approver: Approver } | { skip: string };

// The requester's direct supervisor from Absensi (tim_saya). No supervisor, or an inactive one,
// skips the stage; an unreachable Absensi database stops the submission so it can be retried.
async function lookupAtasan(requesterId: number): Promise<AtasanLookup> {
  const requester = await row<{ karyawan_id: number | null }>(db, "SELECT karyawan_id FROM users WHERE id = ?", [requesterId]);
  if (!requester?.karyawan_id) return { skip: "Akun pemohon tidak terhubung ke data karyawan Absensi." };
  let atasan: Karyawan | null;
  try {
    atasan = await findAtasan(Number(requester.karyawan_id));
  } catch (error) {
    console.error("Atasan lookup failed:", (error as Error).message);
    throw new UserError("Data atasan dari aplikasi Absensi tidak dapat dibaca. Silakan coba beberapa saat lagi.");
  }
  if (!atasan) return { skip: "Pemohon tidak memiliki atasan langsung di Absensi." };
  if (karyawanInactive(atasan)) return { skip: `Atasan langsung (${atasan.nama}) berstatus Non-Aktif di Absensi.` };
  return { karyawan: atasan };
}

// Read before the submission transaction: a supervisor without a Developer account gets one here,
// the same way as on first sign-in, so the approval email can reach them.
export async function resolveAtasan(requesterId: number): Promise<AtasanResult> {
  const found = await lookupAtasan(requesterId);
  if ("skip" in found) return found;
  let userId: number;
  try {
    userId = await ensureUserForKaryawan(Number(found.karyawan.id));
  } catch (error) {
    console.error("Atasan account creation failed:", error);
    throw new UserError("Akun atasan langsung belum berhasil disiapkan. Silakan coba beberapa saat lagi.");
  }
  const approver = await row<Approver>(db, "SELECT id, full_name, karyawan_id FROM users WHERE id = ?", [userId]);
  if (!approver) throw new UserError("Akun atasan langsung tidak ditemukan. Silakan coba kembali.");
  return { approver };
}

// Everything the fixed stages need, checked before a document enters them.
async function assertApproversReady(conn: Db, requesterId: number): Promise<void> {
  const holders = await managerHolders(conn);
  for (const role of MANAGER_ROLES) {
    if (!holders[role]) throw new UserError(`Admin belum menunjuk ${MANAGER_ROLE_LABEL[role]}. Hubungi Admin untuk mengaturnya di menu Users.`);
    if (holders[role].id === requesterId) throw new UserError(`${MANAGER_ROLE_LABEL[role]} hanya menyetujui pengajuan dan tidak dapat mengajukan FPA / FPA-A.`);
  }
  if ((await timItMembers(conn)).length === 0) throw new UserError("Belum ada anggota Tim IT (akun berjabatan Admin di divisi IT). Hubungi Admin.");
}

// The stages a requester's next submission would go through, for the form. Nothing is created.
export async function approvalPreview(requesterId: number): Promise<{ route: string[]; problems: string[] }> {
  const route: string[] = [];
  const problems: string[] = [];
  const holders = await managerHolders(db);
  const members = await timItMembers(db);
  const requesterIsTimIt = members.some((member) => member.id === requesterId);
  let previous: string | null = null;
  const add = (label: string, key: string | null) => {
    if (key === null || key !== previous) route.push(label);
    previous = key;
  };
  try {
    const atasan = await lookupAtasan(requesterId);
    if ("karyawan" in atasan) add(`${STAGE_LABEL.atasan}: ${atasan.karyawan.nama}`, `k${atasan.karyawan.id}`);
  } catch (error) {
    if (!(error instanceof UserError)) throw error;
    problems.push(error.message);
  }
  if (!requesterIsTimIt) add(STAGE_LABEL.tim_it, null);
  for (const role of MANAGER_ROLES) {
    const holder = holders[role];
    if (!holder) {
      problems.push(`Admin belum menunjuk ${MANAGER_ROLE_LABEL[role]}.`);
      continue;
    }
    if (holder.id === requesterId) problems.push(`${MANAGER_ROLE_LABEL[role]} hanya menyetujui pengajuan dan tidak dapat mengajukan.`);
    add(`${MANAGER_ROLE_LABEL[role]}: ${holder.full_name}${role === "manager_fat" ? " (jika ada biaya)" : ""}`, holder.karyawan_id ? `k${holder.karyawan_id}` : `u${holder.id}`);
  }
  if (members.length === 0) problems.push("Belum ada anggota Tim IT (akun berjabatan Admin di divisi IT).");
  return { route, problems };
}

// --- Moving through the stages ------------------------------------------------------------

interface Flow {
  type: DocType;
  id: number;
  run: ApprovalRun;
  atasan: AtasanResult | null;
}

// Creates the steps after `after` (null: from the start of the cycle) until one needs a decision,
// recording each skipped stage with its reason. Consecutive stages held by the same person are
// decided once. Returns false when no stage is left, i.e. the document is approved.
async function openNextStage(tx: PoolConnection, flow: Flow, after: Stage | null, lastApproverId: number | null): Promise<boolean> {
  const { run } = flow;
  const document = await row(tx, `SELECT * FROM ${approvalTable(flow.type)} WHERE id = ?`, [flow.id]);
  const holders = await managerHolders(tx);
  const members = await timItMembers(tx);
  let position = Number(await scalar(tx, "SELECT COALESCE(MAX(position), 0) FROM approval_steps WHERE run_id = ? AND cycle = ?", [run.id, run.cycle]));
  const merged = "Digabung dengan tahap sebelumnya karena approver-nya sama.";

  for (const stage of STAGES.slice(after === null ? 0 : STAGES.indexOf(after) + 1)) {
    let approver: Approver | null = null;
    let skip: string | null = null;
    if (stage === "atasan") {
      if (!flow.atasan) throw new Error("Atasan must be resolved before the stages are opened.");
      if ("skip" in flow.atasan) skip = flow.atasan.skip;
      else approver = flow.atasan.approver;
    } else if (stage === "tim_it") {
      if (members.some((member) => member.id === run.requester_id)) skip = "Pemohon adalah anggota Tim IT.";
      else if (lastApproverId !== null && members.some((member) => member.id === lastApproverId)) skip = merged;
      else if (members.length === 0) throw new UserError("Belum ada anggota Tim IT (akun berjabatan Admin di divisi IT). Hubungi Admin.");
    } else if (stage === "manager_fat" && effectiveCost(flow.type, document ?? {}) <= 0) {
      skip = "Tidak ada biaya, persetujuan Manager FAT tidak diperlukan.";
    } else {
      approver = holders[stage] ?? null;
      if (!approver) throw new UserError(`Admin belum menunjuk ${STAGE_LABEL[stage]}. Hubungi Admin untuk mengaturnya di menu Users.`);
      if (approver.id === run.requester_id) throw new UserError(`${STAGE_LABEL[stage]} adalah pemohon dokumen ini. Minta Admin menunjuk ${STAGE_LABEL[stage]} lain.`);
      if (approver.id === lastApproverId) skip = merged;
    }

    position++;
    await exec(tx, `INSERT INTO approval_steps (run_id, cycle, position, stage, approver_id, approver_name, state, note, acted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${skip === null ? "NULL" : "NOW()"})`, [
      run.id, run.cycle, position, stage, approver?.id ?? null, approver?.full_name ?? STAGE_LABEL[stage], skip === null ? "waiting" : "skipped", skip,
    ]);
    if (skip !== null) continue;
    await exec(tx, "UPDATE approval_runs SET current_position = ? WHERE id = ?", [position, run.id]);
    return true;
  }
  return false;
}

async function finishApproved(tx: PoolConnection, type: DocType, id: number, run: ApprovalRun, document: Row): Promise<void> {
  await exec(tx, "UPDATE approval_runs SET state = 'approved' WHERE id = ?", [run.id]);
  await exec(tx, `UPDATE ${approvalTable(type)} SET status_dokumen = 'Disetujui' WHERE id = ?`, [id]);
  const name = type === "fpa" ? document.nama_aplikasi : document.nama_proyek;
  const number = type === "fpa" ? document.nomor_fpa : document.nomor_fpa_a;
  const description = `Dari Pengajuan ${type === "fpa" ? "FPA" : "FPA-A"} No: ${number}`;
  const project = await exec(tx, "INSERT INTO projects (name, description, category, start_date, status) VALUES (?, ?, 'FPA', ?, 'Active')", [name, description, todayWib()]);
  await exec(tx, "UPDATE approval_runs SET project_id = ? WHERE id = ?", [project.insertId, run.id]);
  await createChecklistItems(tx, type, id, document);
}

// The requester and everyone who has already decided on the document, except the actor.
async function involvedIds(tx: PoolConnection, run: ApprovalRun, actorId: number): Promise<number[]> {
  const approvers = await rows<{ approver_id: number }>(tx, `SELECT DISTINCT approver_id FROM approval_steps
    WHERE run_id = ? AND approver_id IS NOT NULL AND state IN ('approved', 'revision', 'rejected')`, [run.id]);
  return [run.requester_id, ...approvers.map((step) => Number(step.approver_id))].filter((id) => id !== actorId);
}

// Called inside the same transaction as the document insert or legacy activation; atasan is
// resolved beforehand with resolveAtasan.
async function startApproval(tx: PoolConnection, type: DocType, id: number, requester: number, actor: CurrentUser, atasan: AtasanResult): Promise<void> {
  if (!(await row(tx, "SELECT id FROM users WHERE id = ? FOR UPDATE", [requester]))) throw new UserError("Pemohon tidak ditemukan.");
  await assertApproversReady(tx, requester);
  await exec(tx, "INSERT INTO approval_runs (document_type, document_id, requester_id) VALUES (?, ?, ?)", [type, id, requester]);
  const run = (await approvalRun(tx, type, id))!;
  const table = approvalTable(type);
  await exec(tx, `UPDATE ${table} SET status_dokumen = 'Diajukan' WHERE id = ?`, [id]);
  const eventId = await approvalEvent(tx, run, actor, "submit", "", await row(tx, `SELECT * FROM ${table} WHERE id = ?`, [id]));
  if (!(await openNextStage(tx, { type, id, run, atasan }, null, null))) throw new UserError("Jalur approval tidak dapat dibentuk. Hubungi Admin.");
  await queueTurnEmails(tx, run.id, eventId);
}

// A revised document goes through every stage again, from the (re-read) atasan.
export async function restartApproval(tx: PoolConnection, type: DocType, id: number, run: ApprovalRun, actor: CurrentUser, atasan: AtasanResult): Promise<void> {
  await assertApproversReady(tx, run.requester_id);
  await exec(tx, "UPDATE approval_runs SET cycle = cycle + 1, current_position = 1, state = 'pending' WHERE id = ?", [run.id]);
  const next: ApprovalRun = { ...run, cycle: run.cycle + 1, current_position: 1, state: "pending" };
  const eventId = await approvalEvent(tx, next, actor, "resubmit", "", await row(tx, `SELECT * FROM ${approvalTable(type)} WHERE id = ?`, [id]));
  if (!(await openNextStage(tx, { type, id, run: next, atasan }, null, null))) throw new UserError("Jalur approval tidak dapat dibentuk. Hubungi Admin.");
  await queueTurnEmails(tx, run.id, eventId);
  await queueInfoEmails(tx, run.id, eventId, await involvedIds(tx, next, actor.id));
}

export async function canViewApproval(run: ApprovalRun | null, document: Row, user: CurrentUser): Promise<boolean> {
  if (user.role === "Admin" || Number(document.created_by_user_id) === user.id) return true;
  if (!run) return false;
  return Boolean(await row(db, "SELECT 1 FROM approval_steps WHERE run_id = ? AND approver_id = ? LIMIT 1", [run.id, user.id]));
}

function currentStep(run: ApprovalRun | null, steps: ApprovalStep[]): ApprovalStep | undefined {
  return run ? steps.find((step) => step.position === run.current_position) : undefined;
}

export function canActApproval(run: ApprovalRun | null, steps: ApprovalStep[], user: CurrentUser): boolean {
  if (!run || run.state !== "pending" || run.requester_id === user.id) return false;
  const current = currentStep(run, steps);
  if (!current || current.state !== "waiting") return false;
  return current.stage === "tim_it" && current.approver_id === null ? isTimIt(user) : current.approver_id === user.id;
}

// Tim IT and Manager IT may correct the budget while the document waits for their own decision.
export function canAdjustBudget(run: ApprovalRun | null, steps: ApprovalStep[], user: CurrentUser): boolean {
  const stage = currentStep(run, steps)?.stage;
  return (stage === "tim_it" || stage === "manager_it") && canActApproval(run, steps, user);
}

// Only Manager IT (and the old per-requester routes) can end a document; other stages send it back.
export function canRejectFinal(run: ApprovalRun | null, steps: ApprovalStep[]): boolean {
  const stage = currentStep(run, steps)?.stage;
  return stage === null || stage === "manager_it";
}

function waitingLabel(stage: Stage | null, approverId: number | null, approverName: string): string {
  if (!stage) return `Menunggu approval ${approverName}`;
  return `Menunggu ${STAGE_LABEL[stage]}${approverId ? ` (${approverName})` : ""}`;
}

export function approvalLabel(run: ApprovalRun | null, steps: ApprovalStep[], fallback: string): string {
  if (!run) return ["Draft", "Diajukan", "Diverifikasi"].includes(fallback) ? "Belum memiliki jalur approval" : fallback;
  const labels: Record<string, string> = { revision: "Perlu revisi pemohon", approved: "Disetujui final", rejected: "Ditolak" };
  if (labels[run.state]) return labels[run.state];
  const current = currentStep(run, steps);
  return current ? waitingLabel(current.stage, current.approver_id, current.approver_name) : "Menunggu approval";
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
    if (action === "reject" && !canRejectFinal(run, steps)) throw new UserError("Hanya Manager IT yang dapat menolak final. Gunakan Kembalikan untuk Revisi.");
    const current = currentStep(run, steps)!;
    const state = ({ approve: "approved", reject: "rejected", revision: "revision" } as const)[action as "approve"];
    // A Tim IT step records the member who decided it.
    await exec(tx, "UPDATE approval_steps SET state = ?, note = ?, acted_at = NOW(), approver_id = ?, approver_name = ? WHERE run_id = ? AND cycle = ? AND position = ?", [
      state, note, user.id, user.full_name, run.id, cycle, position,
    ]);

    if (action === "approve") {
      let hasNext: boolean;
      if (current.stage === null) {
        // Old per-requester route: its steps already exist.
        hasNext = position < steps.length;
        if (hasNext) await exec(tx, "UPDATE approval_runs SET current_position = current_position + 1 WHERE id = ?", [run.id]);
      } else {
        hasNext = await openNextStage(tx, { type, id, run, atasan: null }, current.stage, user.id);
      }
      if (hasNext) {
        const eventId = await approvalEvent(tx, run, user, "approve", note);
        await queueTurnEmails(tx, run.id, eventId);
        await queueInfoEmails(tx, run.id, eventId, [run.requester_id]);
        return "Persetujuan disimpan dan diteruskan ke tahap berikutnya.";
      }
      await finishApproved(tx, type, id, run, document);
      const eventId = await approvalEvent(tx, run, user, "approve_final", note);
      await queueInfoEmails(tx, run.id, eventId, await involvedIds(tx, run, user.id));
      return "Disetujui final. Project berhasil dibuat.";
    }

    await exec(tx, "UPDATE approval_runs SET state = ? WHERE id = ?", [state, run.id]);
    await exec(tx, "UPDATE approval_steps SET state = 'skipped' WHERE run_id = ? AND cycle = ? AND state = 'waiting'", [run.id, cycle]);
    await exec(tx, `UPDATE ${table} SET status_dokumen = ? WHERE id = ?`, [action === "reject" ? "Ditolak" : "Revisi", id]);
    const eventId = await approvalEvent(tx, run, user, action, note);
    await queueInfoEmails(tx, run.id, eventId, await involvedIds(tx, run, user.id));
    return action === "reject" ? "Pengajuan ditolak." : "Pengajuan dikembalikan kepada pemohon untuk direvisi.";
  });
}

export async function activateLegacyApproval(type: DocType, id: number, user: CurrentUser): Promise<void> {
  if (user.role !== "Admin") throw new UserError("Hanya Admin yang dapat mengaktifkan jalur dokumen lama.");
  const table = approvalTable(type);
  const owner = await row<{ created_by_user_id: number | null }>(db, `SELECT created_by_user_id FROM ${table} WHERE id = ?`, [id]);
  if (!owner?.created_by_user_id) throw new UserError("Dokumen ini tidak dapat diaktifkan. Pastikan pemohon tercatat dan dokumen belum selesai.");
  const atasan = await resolveAtasan(Number(owner.created_by_user_id));
  await transaction(async (tx) => {
    const document = await row(tx, `SELECT * FROM ${table} WHERE id = ? FOR UPDATE`, [id]);
    if (!document || Number(document.created_by_user_id) !== Number(owner.created_by_user_id) || !["Draft", "Diajukan", "Diverifikasi"].includes(document.status_dokumen) || (await approvalRun(tx, type, id, true))) {
      throw new UserError("Dokumen ini tidak dapat diaktifkan. Pastikan pemohon tercatat dan dokumen belum selesai.");
    }
    await startApproval(tx, type, id, Number(document.created_by_user_id), user, atasan);
  });
}

// Tim IT or Manager IT corrects the budget during their own turn; null returns to the requester's
// value. The requester's own figure stays untouched, and the change is mailed to everyone involved.
export async function adjustBudget(type: DocType, id: number, user: CurrentUser, rawValue: string, rawReason: string): Promise<string> {
  const amount = parseRupiah(rawValue);
  if (amount === undefined) throw new UserError("Budget tidak valid. Gunakan titik untuk ribuan dan koma untuk desimal.");
  const reason = rawReason.trim();
  if (reason === "" || [...reason].length > 1000) throw new UserError("Alasan perubahan budget wajib diisi, maksimal 1.000 karakter.");
  const table = approvalTable(type);
  const { corrected } = costColumns(type);
  await transaction(async (tx) => {
    const document = await row(tx, `SELECT * FROM ${table} WHERE id = ? FOR UPDATE`, [id]);
    const run = await approvalRun(tx, type, id, true);
    const steps = run ? await approvalSteps(tx, run) : [];
    if (!document || !run || !canAdjustBudget(run, steps, user)) throw new UserError("Budget hanya dapat diubah oleh Tim IT atau Manager IT saat dokumen berada di giliran mereka.");
    const before = effectiveCost(type, document);
    await exec(tx, `UPDATE ${table} SET ${corrected} = ? WHERE id = ?`, [amount, id]);
    const after = effectiveCost(type, { ...document, [corrected]: amount });
    const change = `${rupiah(before)} → ${rupiah(after)}${amount === null ? " (kembali ke nilai pemohon)" : ""}`;
    const eventId = await approvalEvent(tx, run, user, "adjust_budget", `${change}\nAlasan: ${reason}`);
    await queueInfoEmails(tx, run.id, eventId, await involvedIds(tx, run, user.id));
  });
  return "Budget berhasil diubah.";
}

// Admin chooses Manager IT and Manager FAT. Documents already waiting for a role move to its new
// holder, who is asked by email.
export async function saveManagerRoles(choices: Record<ManagerRole, number>, admin: CurrentUser): Promise<string> {
  if (admin.role !== "Admin") throw new UserError("Hanya Admin yang dapat menunjuk Manager IT dan Manager FAT.");
  await transaction(async (tx) => {
    const before = await managerHolders(tx);
    for (const role of MANAGER_ROLES) {
      const label = MANAGER_ROLE_LABEL[role];
      const target = choices[role] ? await row<Approver>(tx, "SELECT id, full_name, karyawan_id FROM users WHERE id = ?", [choices[role]]) : null;
      if (!target) throw new UserError(`Pilih akun untuk ${label}.`);
      if (before[role]?.id === target.id) continue;
      await exec(tx, "INSERT INTO approval_roles (role_key, user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)", [role, target.id]);
      const waiting = await rows<ApprovalRun & { position: number }>(tx, `SELECT r.*, s.position FROM approval_runs r
        JOIN approval_steps s ON s.run_id = r.id AND s.cycle = r.cycle AND s.position = r.current_position
        WHERE r.state = 'pending' AND s.state = 'waiting' AND s.stage = ? FOR UPDATE`, [role]);
      for (const run of waiting) {
        if (run.requester_id === target.id) throw new UserError(`${target.full_name} adalah pemohon dokumen yang sedang menunggu ${label}, jadi belum dapat ditunjuk.`);
        await exec(tx, "UPDATE approval_steps SET approver_id = ?, approver_name = ? WHERE run_id = ? AND cycle = ? AND position = ?", [target.id, target.full_name, run.id, run.cycle, run.position]);
        const eventId = await approvalEvent(tx, run, admin, "reassign", `${label} dialihkan dari ${before[role]?.full_name ?? "-"} ke ${target.full_name}.`);
        await queueTurnEmails(tx, run.id, eventId);
      }
    }
  });
  return "Peran approval disimpan.";
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

// Waiting for this account: its own step, or a Tim IT step when it is a Tim IT member.
function myTurnWhere(user: CurrentUser): [string, (string | number)[]] {
  return ["r.state = 'pending' AND s.state = 'waiting' AND r.requester_id <> ? AND (s.approver_id = ? OR (s.stage = 'tim_it' AND s.approver_id IS NULL AND ? = 1))", [
    user.id, user.id, isTimIt(user) ? 1 : 0,
  ]];
}

export async function approvalList(type: DocType, user: CurrentUser, view: ListView): Promise<Row[]> {
  const table = approvalTable(type);
  const params: (string | number)[] = [type];
  const where: string[] = [];
  if (view === "pending") {
    const [sql, turnParams] = myTurnWhere(user);
    where.push(sql);
    params.push(...turnParams);
  } else if (view === "mine") {
    where.push("d.created_by_user_id = ?");
    params.push(user.id);
  } else if (view !== "board" && user.role !== "Admin") {
    // 'board' (used by the shared Task list) is visible to everyone; every other view
    // restricts a non-Admin to documents they requested or are an approver on.
    where.push("(d.created_by_user_id = ? OR EXISTS (SELECT 1 FROM approval_steps visible WHERE visible.run_id = r.id AND visible.approver_id = ?))");
    params.push(user.id, user.id);
  }
  const list = await rows(db, `SELECT d.*, r.state AS workflow_state, s.stage AS current_stage, s.approver_id AS current_approver_id, s.approver_name AS current_approver
    FROM ${table} d LEFT JOIN approval_runs r ON r.document_type = ? AND r.document_id = d.id
    LEFT JOIN approval_steps s ON s.run_id = r.id AND s.cycle = r.cycle AND s.position = r.current_position
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY d.created_at DESC, d.id DESC`, params);
  const labels: Record<string, string> = { approved: "Disetujui final", rejected: "Ditolak", revision: "Perlu revisi pemohon" };
  return list.map((item) => ({
    ...item,
    approval_label: item.workflow_state === "pending"
      ? waitingLabel(item.current_stage, item.current_approver_id, item.current_approver)
      : labels[item.workflow_state ?? ""] ?? approvalLabel(null, [], item.status_dokumen),
  }));
}

export async function pendingApprovalCount(user: CurrentUser): Promise<number> {
  const [sql, params] = myTurnWhere(user);
  const found = await row(db, `SELECT COUNT(*) AS total FROM approval_runs r
    JOIN approval_steps s ON s.run_id = r.id AND s.cycle = r.cycle AND s.position = r.current_position
    WHERE ${sql}`, params);
  return Number(found?.total ?? 0);
}

export { startApproval };
