import "server-only";
import type { PoolConnection } from "mysql2/promise";
import { db, exec, row, rows, scalar, transaction, type Db, type Row } from "./db";
import { UserError, type CurrentUser } from "./auth";
import { approvalEvent, approvalRun, involvedIds, scheduleRevisionDeadline, SYSTEM, timItMembers, type Actor, type ApprovalRun } from "./approval";
import { approvalTable, type DocType } from "./documents";
import { computeTaskDeadline, documentLateDays, fpaCalendarDeadline, fpaDeadline } from "./deadlines";
import { deliverDocumentApprovalEmail, queueInfoEmails } from "./email";
import { completionLimits, workingDays } from "./settings";
import { formatDeadline, stageSchedule } from "./workdays";
import { wibDateTime } from "./dates";

// What happens after final approval (FLOW_APLIKASI.txt section 7): an FPA / FPA-A becomes Selesai once
// every checklist item is tested, and an FPA also waits for its running FPA-A. The cron applies the
// time limits: items left untested, the requester's daily "ready to test" email, and FPA-A revisions
// that are never resent.

// FPA-A statuses that still hold their parent FPA open.
export const RUNNING_FPAA_STATUSES = ["Diajukan", "Diverifikasi", "Disetujui", "Revisi"];

// The daily "items ready to test" email goes out with the first cron run from this hour (WIB).
const DIGEST_HOUR = 16;

export function runningAddenda(conn: Db, nomorFpa: string | null): Promise<{ id: number; nomor_fpa_a: string | null; status_dokumen: string }[]> {
  if (!nomorFpa) return Promise.resolve([]);
  return rows(conn, `SELECT id, nomor_fpa_a, status_dokumen FROM fpa_a_submissions WHERE nomor_fpa_utama = ? AND status_dokumen IN (${RUNNING_FPAA_STATUSES.map(() => "?").join(", ")}) ORDER BY id`, [
    nomorFpa, ...RUNNING_FPAA_STATUSES,
  ]);
}

// Locks a document's checklist rows, then the document, in the same order as toggleChecklistItem.
async function lockDocument(tx: PoolConnection, type: DocType, id: number): Promise<Row | null> {
  await rows(tx, "SELECT id FROM submission_checklist_items WHERE document_type = ? AND document_id = ? FOR UPDATE", [type, id]);
  return row(tx, `SELECT * FROM ${approvalTable(type)} WHERE id = ? FOR UPDATE`, [id]);
}

// Marks a Disetujui document Selesai when it qualifies: every item tested (manual: no items at all,
// Admin only), and for an FPA no running FPA-A. Closes its project, records the event, and mails the
// requester, everyone who decided on its route, and Tim IT. A finished FPA-A rechecks its parent.
async function finishDocument(tx: PoolConnection, type: DocType, id: number, actor: Actor, manual = false): Promise<boolean> {
  const table = approvalTable(type);
  const document = await row(tx, `SELECT * FROM ${table} WHERE id = ? FOR UPDATE`, [id]);
  if (!document || document.status_dokumen !== "Disetujui") return false;
  const counts = await row(tx, "SELECT COUNT(*) AS total, COALESCE(SUM(user_tested_at IS NULL), 0) AS untested FROM submission_checklist_items WHERE document_type = ? AND document_id = ?", [type, id]);
  const total = Number(counts?.total ?? 0);
  if (manual ? total !== 0 : total === 0 || Number(counts?.untested ?? 0) > 0) return false;
  if (type === "fpa" && (await runningAddenda(tx, document.nomor_fpa)).length > 0) return false;

  await exec(tx, `UPDATE ${table} SET status_dokumen = 'Selesai', tanggal_selesai = CURDATE() WHERE id = ?`, [id]);
  const run = await approvalRun(tx, type, id, true);
  if (run?.project_id) await exec(tx, "UPDATE projects SET status = 'Completed', end_date = CURDATE() WHERE id = ?", [run.project_id]);
  if (run) {
    let note = manual ? "Diselesaikan Admin: dokumen tidak memiliki item checklist." : "Semua item checklist sudah ditest.";
    if (type === "fpa") {
      const addenda = Number(await scalar(tx, "SELECT COUNT(*) FROM fpa_a_submissions WHERE nomor_fpa_utama = ? AND status_dokumen = 'Selesai'", [document.nomor_fpa]));
      if (addenda > 0) note += ` ${addenda} FPA-A terkait juga sudah selesai.`;
    }
    const eventId = await approvalEvent(tx, run, actor, "complete", note);
    const timIt = (await timItMembers(tx)).map((member) => member.id);
    await queueInfoEmails(tx, run.id, eventId, [...(await involvedIds(tx, run, actor.id)), ...timIt].filter((recipient) => recipient !== actor.id));
  }
  if (type === "fpaa") await completeParentFpa(tx, document.nomor_fpa_utama);
  return true;
}

export function completeIfDone(tx: PoolConnection, type: DocType, id: number, actor: Actor): Promise<boolean> {
  return finishDocument(tx, type, id, actor);
}

// An FPA-A finished or was rejected: its parent FPA may now be done.
export async function completeParentFpa(tx: PoolConnection, nomorFpa: string | null): Promise<void> {
  if (!nomorFpa) return;
  const parent = await row<{ id: number }>(tx, "SELECT id FROM fpa_submissions WHERE nomor_fpa = ?", [nomorFpa]);
  if (parent) await finishDocument(tx, "fpa", Number(parent.id), SYSTEM);
}

// Admin closes an approved document that has no checklist items, which otherwise could never finish.
export async function completeManually(type: DocType, id: number, user: CurrentUser): Promise<string> {
  if (user.role !== "Admin") throw new UserError("Hanya Admin yang dapat menyelesaikan dokumen tanpa item checklist.");
  await transaction(async (tx) => {
    const document = await lockDocument(tx, type, id);
    if (!document || document.status_dokumen !== "Disetujui") throw new UserError("Dokumen ini tidak berstatus Disetujui.");
    if (Number(await scalar(tx, "SELECT COUNT(*) FROM submission_checklist_items WHERE document_type = ? AND document_id = ?", [type, id])) > 0) {
      throw new UserError("Dokumen ini memiliki item checklist, jadi selesai otomatis setelah semua item ditest.");
    }
    const running = type === "fpa" ? await runningAddenda(tx, document.nomor_fpa) : [];
    if (running.length) throw new UserError(`Masih ada FPA-A yang berjalan: ${running.map((a) => a.nomor_fpa_a ?? `#${a.id}`).join(", ")}.`);
    if (!(await finishDocument(tx, type, id, user, true))) throw new UserError("Dokumen belum dapat diselesaikan. Muat ulang halaman.");
  });
  return "Pengajuan dinyatakan Selesai.";
}

// After a checklist change commits: send its emails now, including the parent FPA's when the change
// finished an FPA-A (the cron sends anything left).
export async function deliverChecklistEmails(type: DocType, id: number): Promise<void> {
  await deliverDocumentApprovalEmail(type, id);
  if (type !== "fpaa") return;
  const parent = await row<{ id: number }>(db, "SELECT f.id FROM fpa_a_submissions a JOIN fpa_submissions f ON f.nomor_fpa = a.nomor_fpa_utama WHERE a.id = ?", [id]);
  if (parent) await deliverDocumentApprovalEmail("fpa", Number(parent.id));
}

// The test window an item gets when Dev marks it now: Admin's setting, fixed afterwards.
export async function testSchedule(conn: Db): Promise<{ days: number; due: string; remind: string | null }> {
  const days = (await completionLimits(conn)).test;
  const now = String(await scalar(conn, "SELECT NOW()"));
  return { days, ...stageSchedule(now, days, await workingDays(conn)) };
}

// Approved (or finished) FPA-A days that push an FPA's deadline out, as working days.
export async function fpaExtensionDays(conn: Db, nomorFpa: string | null): Promise<number> {
  if (!nomorFpa) return 0;
  return Number(await scalar(conn, `SELECT COALESCE(SUM(COALESCE(tambahan_waktu_admin, tambahan_waktu)), 0) FROM fpa_a_submissions
    WHERE nomor_fpa_utama = ? AND status_dokumen IN ('Disetujui', 'Selesai') AND COALESCE(tambahan_waktu_admin, tambahan_waktu) > 0`, [nomorFpa]));
}

// Where an approved document stands on its way to Selesai, for the detail page.
export interface CompletionInfo {
  finishedAt: string | null;
  deadline: string | null;
  lateDays: number | null;
  lateUnit: string;
  // FPA only: its FPA-A still running, which it waits for.
  waitingAddenda: string[];
  // Admin may close a document that has no checklist items.
  canCompleteManually: boolean;
}

export async function completionInfo(type: DocType, document: Row, user: CurrentUser, itemCount: number): Promise<CompletionInfo> {
  const workdays = await workingDays();
  let deadline: string | null;
  let calendar = false;
  if (type === "fpa") {
    deadline = fpaDeadline(document as Parameters<typeof fpaDeadline>[0], await fpaExtensionDays(db, document.nomor_fpa), workdays);
    calendar = fpaCalendarDeadline(document as Parameters<typeof fpaCalendarDeadline>[0]);
  } else {
    deadline = computeTaskDeadline(document.created_at ? String(document.created_at).slice(0, 10) : null, document.tambahan_waktu_admin ?? document.tambahan_waktu);
  }
  const approved = document.status_dokumen === "Disetujui";
  const waiting = approved && type === "fpa" ? await runningAddenda(db, document.nomor_fpa) : [];
  return {
    finishedAt: document.tanggal_selesai ?? null,
    deadline,
    lateDays: documentLateDays(deadline, document.tanggal_selesai ?? null, calendar ? null : workdays),
    lateUnit: calendar ? "hari" : "hari kerja",
    waitingAddenda: waiting.map((a) => `${a.nomor_fpa_a ?? `#${a.id}`} (${a.status_dokumen})`),
    canCompleteManually: approved && user.role === "Admin" && itemCount === 0 && waiting.length === 0,
  };
}

const itemLine = (item: Row) => `${item.item_index}. ${item.item_text}`;

// --- Run by the cron ------------------------------------------------------------------------

type Outcome = "revision_scheduled" | "revision_reminded" | "revision_rejected" | "test_scheduled" | "test_reminded" | "auto_tested" | "digests" | "completed" | "failed";

async function each<T>(list: T[], result: Record<Outcome, number>, label: (item: T) => string, work: (tx: PoolConnection, item: T) => Promise<Outcome | null>): Promise<void> {
  for (const item of list) {
    try {
      const outcome = await transaction((tx) => work(tx, item));
      if (outcome) result[outcome]++;
    } catch (error) {
      result.failed++;
      console.error(`${label(item)} not processed:`, error instanceof UserError ? error.message : error);
    }
  }
}

// An FPA-A waiting for its requester's revision: the window starts now for one sent back before the
// window existed; a reminder goes one working day ahead; once it passes, the FPA-A is rejected.
async function handleRevisionDeadline(tx: PoolConnection, id: number): Promise<Outcome | null> {
  const document = await row(tx, "SELECT * FROM fpa_a_submissions WHERE id = ? FOR UPDATE", [id]);
  const run = await approvalRun(tx, "fpaa", id, true);
  if (!document || !run || run.state !== "revision" || document.status_dokumen !== "Revisi") return null;
  if (run.revision_due_at === null) {
    await scheduleRevisionDeadline(tx, run.id);
    return "revision_scheduled";
  }
  const now = String(await scalar(tx, "SELECT NOW()"));
  if (run.revision_due_at <= now) {
    const days = run.revision_due_days ?? (await completionLimits(tx)).revisi_fpaa;
    await exec(tx, "UPDATE approval_runs SET state = 'rejected' WHERE id = ?", [run.id]);
    await exec(tx, "UPDATE fpa_a_submissions SET status_dokumen = 'Ditolak' WHERE id = ?", [id]);
    const eventId = await approvalEvent(tx, run, SYSTEM, "auto_reject", `Ditolak otomatis: revisi tidak dikirim ulang dalam ${days} hari kerja.`);
    await queueInfoEmails(tx, run.id, eventId, await involvedIds(tx, run, null));
    await completeParentFpa(tx, document.nomor_fpa_utama);
    return "revision_rejected";
  }
  if (run.revision_remind_at !== null && run.revision_remind_at <= now && run.revision_reminded_at === null) {
    await exec(tx, "UPDATE approval_runs SET revision_reminded_at = NOW() WHERE id = ?", [run.id]);
    const eventId = await approvalEvent(tx, run, SYSTEM, "revision_reminder", `Batas kirim revisi: ${formatDeadline(run.revision_due_at)}. Jika belum dikirim ulang, FPA-A ini ditolak otomatis.`);
    await queueInfoEmails(tx, run.id, eventId, [run.requester_id]);
    return "revision_reminded";
  }
  return null;
}

type DocRef = { document_type: DocType; document_id: number };
const docLabel = (item: DocRef) => `Checklist of ${item.document_type} #${item.document_id}`;

// Items waiting for the requester on documents still Disetujui, matching `condition` (alias c).
function waitingItemDocs(condition: string, limit: number): Promise<DocRef[]> {
  return rows<DocRef>(db, `SELECT DISTINCT c.document_type, c.document_id FROM submission_checklist_items c
    LEFT JOIN fpa_submissions f ON c.document_type = 'fpa' AND f.id = c.document_id
    LEFT JOIN fpa_a_submissions a ON c.document_type = 'fpaa' AND a.id = c.document_id
    WHERE c.dev_done_by IS NOT NULL AND c.user_tested_at IS NULL AND COALESCE(f.status_dokumen, a.status_dokumen) = 'Disetujui' AND ${condition}
    ORDER BY c.document_type, c.document_id LIMIT ${limit}`);
}

// Rechecked under the lock: the items still waiting for the requester that match `condition`.
async function lockedWaitingItems(tx: PoolConnection, item: DocRef, condition: string): Promise<{ document: Row; run: ApprovalRun | null; items: Row[] } | null> {
  const document = await lockDocument(tx, item.document_type, item.document_id);
  if (!document || document.status_dokumen !== "Disetujui") return null;
  const items = await rows(tx, `SELECT * FROM submission_checklist_items c WHERE c.document_type = ? AND c.document_id = ?
    AND c.dev_done_by IS NOT NULL AND c.user_tested_at IS NULL AND ${condition} ORDER BY c.item_index`, [item.document_type, item.document_id]);
  if (items.length === 0) return null;
  return { document, run: await approvalRun(tx, item.document_type, item.document_id), items };
}

export async function processCompletion(limit = 100): Promise<Record<Outcome, number>> {
  const result: Record<Outcome, number> = {
    revision_scheduled: 0, revision_reminded: 0, revision_rejected: 0, test_scheduled: 0, test_reminded: 0, auto_tested: 0, digests: 0, completed: 0, failed: 0,
  };
  const max = Math.max(1, Math.min(500, limit));

  // 1. FPA-A revisions.
  const revisions = await rows<{ document_id: number }>(db, `SELECT document_id FROM approval_runs
    WHERE document_type = 'fpaa' AND state = 'revision'
      AND (revision_due_at IS NULL OR revision_due_at <= NOW() OR (revision_remind_at <= NOW() AND revision_reminded_at IS NULL))
    ORDER BY revision_due_at LIMIT ${max}`);
  await each(revisions, result, (item) => `FPA-A #${item.document_id} revision limit`, (tx, item) => handleRevisionDeadline(tx, Number(item.document_id)));

  // 2. Items Dev marked before the test window existed: their window starts now.
  await each(await waitingItemDocs("c.test_due_at IS NULL", max), result, docLabel, async (tx, item) => {
    const locked = await lockedWaitingItems(tx, item, "c.test_due_at IS NULL");
    if (!locked) return null;
    const schedule = await testSchedule(tx);
    await exec(tx, `UPDATE submission_checklist_items SET test_due_days = ?, test_due_at = ?, test_remind_at = ?, test_reminded_at = NULL
      WHERE id IN (${locked.items.map(() => "?").join(", ")})`, [schedule.days, schedule.due, schedule.remind, ...locked.items.map((i) => i.id)]);
    return "test_scheduled";
  });

  // 3. Windows that passed: the items count as tested, which may finish the document.
  await each(await waitingItemDocs("c.test_due_at <= NOW()", max), result, docLabel, async (tx, item) => {
    const locked = await lockedWaitingItems(tx, item, "c.test_due_at <= NOW()");
    if (!locked) return null;
    await exec(tx, `UPDATE submission_checklist_items SET user_tested_at = NOW(), auto_completed = 1 WHERE id IN (${locked.items.map(() => "?").join(", ")})`, locked.items.map((i) => i.id));
    if (locked.run) {
      const days = Number(locked.items[0].test_due_days ?? (await completionLimits(tx)).test);
      await approvalEvent(tx, locked.run, SYSTEM, "checklist_auto_test", `Dianggap sudah ditest karena pemohon tidak merespons dalam ${days} hari kerja:\n${locked.items.map(itemLine).join("\n")}`);
    }
    if (await completeIfDone(tx, item.document_type, item.document_id, SYSTEM)) result.completed++;
    return "auto_tested";
  });

  // 4. One working day before a window ends, remind the requester.
  await each(await waitingItemDocs("c.test_remind_at <= NOW() AND c.test_reminded_at IS NULL AND c.test_due_at > NOW()", max), result, docLabel, async (tx, item) => {
    const locked = await lockedWaitingItems(tx, item, "c.test_remind_at <= NOW() AND c.test_reminded_at IS NULL AND c.test_due_at > NOW()");
    if (!locked) return null;
    await exec(tx, `UPDATE submission_checklist_items SET test_reminded_at = NOW() WHERE id IN (${locked.items.map(() => "?").join(", ")})`, locked.items.map((i) => i.id));
    if (!locked.run) return null;
    const lines = locked.items.map((i) => `${itemLine(i)} (batas: ${formatDeadline(i.test_due_at)})`).join("\n");
    const eventId = await approvalEvent(tx, locked.run, SYSTEM, "checklist_reminder", lines);
    await queueInfoEmails(tx, locked.run.id, eventId, [locked.run.requester_id]);
    return "test_reminded";
  });

  // 5. Once a day, tell the requester which items Dev finished since the last email.
  if (Number(wibDateTime().slice(11, 13)) >= DIGEST_HOUR) {
    const fresh = "c.dev_notified_at IS NULL AND c.test_due_at IS NOT NULL";
    await each(await waitingItemDocs(fresh, max), result, docLabel, async (tx, item) => {
      const locked = await lockedWaitingItems(tx, item, fresh);
      if (!locked) return null;
      if (locked.run && (await scalar(tx, "SELECT 1 FROM approval_events WHERE run_id = ? AND action = 'checklist_ready' AND created_at >= CURDATE() LIMIT 1", [locked.run.id]))) return null;
      await exec(tx, `UPDATE submission_checklist_items SET dev_notified_at = NOW() WHERE id IN (${locked.items.map(() => "?").join(", ")})`, locked.items.map((i) => i.id));
      if (!locked.run) return null;
      const lines = locked.items.map((i) => `${itemLine(i)} (batas test: ${formatDeadline(i.test_due_at)})`).join("\n");
      const eventId = await approvalEvent(tx, locked.run, SYSTEM, "checklist_ready", lines);
      await queueInfoEmails(tx, locked.run.id, eventId, [locked.run.requester_id]);
      return "digests";
    });
  }

  // 6. Anything already fully tested but still open (FPA-A first, their parents follow).
  for (const type of ["fpaa", "fpa"] as DocType[]) {
    const done = await rows<{ id: number }>(db, `SELECT d.id FROM ${approvalTable(type)} d WHERE d.status_dokumen = 'Disetujui'
      AND EXISTS (SELECT 1 FROM submission_checklist_items c WHERE c.document_type = ? AND c.document_id = d.id)
      AND NOT EXISTS (SELECT 1 FROM submission_checklist_items c WHERE c.document_type = ? AND c.document_id = d.id AND c.user_tested_at IS NULL)
      ${type === "fpa" ? `AND NOT EXISTS (SELECT 1 FROM fpa_a_submissions a WHERE a.nomor_fpa_utama = d.nomor_fpa AND a.status_dokumen IN (${RUNNING_FPAA_STATUSES.map((s) => `'${s}'`).join(", ")}))` : ""}
      ORDER BY d.id LIMIT ${max}`, [type, type]);
    await each(done, result, (item) => `${type} #${item.id} completion`, async (tx, item) => {
      await lockDocument(tx, type, Number(item.id));
      return (await completeIfDone(tx, type, Number(item.id), SYSTEM)) ? "completed" : null;
    });
  }
  return result;
}
