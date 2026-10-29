import "server-only";
import nodemailer from "nodemailer";
import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { db, exec, row, rows, scalar, type Row } from "./db";
import { approvalTable, detailUrl, effectiveCost, revisionUrl, rupiah, STAGE_LABEL, type DocType, type Stage } from "./documents";
import { timItWhere } from "./menus";

interface MailSettings {
  enabled: boolean;
  host: string;
  port: number;
  encryption: "tls" | "ssl";
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  baseUrl: string;
}

// SMTP settings live in the server environment (.env.local), never in the database.
export function mailSettings(): MailSettings {
  const env = process.env;
  return {
    enabled: env.MAIL_ENABLED === "true",
    host: env.MAIL_HOST ?? "",
    port: Number(env.MAIL_PORT) || 587,
    encryption: env.MAIL_ENCRYPTION === "ssl" ? "ssl" : "tls",
    username: env.MAIL_USERNAME ?? "",
    password: env.MAIL_PASSWORD ?? "",
    fromEmail: env.MAIL_FROM_EMAIL ?? "",
    fromName: env.MAIL_FROM_NAME || "IT PSLU",
    baseUrl: (env.APP_BASE_URL ?? "").replace(/\/+$/, ""),
  };
}

// These inserts belong to the document transaction, so rolled-back decisions send no mail. Each
// event mails a person at most once: a turn email queued first wins over an info email.

// Asks the current turn for a decision: the approver, or every Tim IT member for that group stage.
export async function queueTurnEmails(tx: PoolConnection, runId: number, eventId: number): Promise<void> {
  await exec(tx, `INSERT INTO approval_email_queue (run_id, event_id, kind, cycle, position, recipient_id)
    SELECT r.id, ?, 'turn', r.cycle, r.current_position, u.id FROM approval_runs r
    JOIN approval_steps s ON s.run_id = r.id AND s.cycle = r.cycle AND s.position = r.current_position
    JOIN users u ON (s.approver_id IS NULL AND s.stage = 'tim_it' AND ${timItWhere("u")}) OR u.id = s.approver_id
    WHERE r.id = ? AND r.state = 'pending' AND s.state = 'waiting' AND u.id <> r.requester_id
    ON DUPLICATE KEY UPDATE id = approval_email_queue.id`, [eventId, runId]);
}

// Tells people involved in the document what happened (decision, budget change, revision).
export async function queueInfoEmails(tx: PoolConnection, runId: number, eventId: number, recipientIds: number[]): Promise<void> {
  for (const recipientId of new Set(recipientIds)) {
    await exec(tx, `INSERT INTO approval_email_queue (run_id, event_id, kind, cycle, position, recipient_id)
      SELECT id, ?, 'info', cycle, current_position, ? FROM approval_runs WHERE id = ?
      ON DUPLICATE KEY UPDATE id = approval_email_queue.id`, [eventId, recipientId, runId]);
  }
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

// Where the document stands when the email is sent.
function positionLine(run: Row, current: Row | null): string {
  if (run.state === "approved") return "Disetujui final";
  if (run.state === "rejected") return "Ditolak";
  if (run.state === "revision") return "Menunggu revisi pemohon";
  if (!current) return "Menunggu approval";
  if (!current.stage) return `Menunggu approval ${current.approver_name}`;
  return `Menunggu ${STAGE_LABEL[current.stage as Stage]}${current.approver_id ? ` (${current.approver_name})` : ""}`;
}

function approvalEmailMessage(job: Row, document: Row, run: Row, current: Row | null, settings: MailSettings) {
  const type = job.document_type as DocType;
  const typeLabel = type === "fpa" ? "FPA" : "FPA-A";
  const number = String(document[type === "fpa" ? "nomor_fpa" : "nomor_fpa_a"] ?? "") || `#${job.document_id}`;
  const subjectNumber = number.replace(/[\r\n]+/g, " ");
  const name = document[type === "fpa" ? "nama_aplikasi" : "nama_proyek"];
  const requester = document[type === "fpa" ? "nama_pemohon" : "user_nama"];
  const cost = effectiveCost(type, document);
  const isRequester = Number(job.recipient_id) === Number(run.requester_id);
  const link = settings.baseUrl + (job.event_action === "revision" && isRequester && run.state === "revision" ? revisionUrl(type, Number(job.document_id)) : detailUrl(type, Number(job.document_id)));
  const actor = String(job.actor_name ?? "");
  const note = job.event_note ? `\nCatatan: ${job.event_note}` : "";

  let subject: string;
  let intro: string;
  let button = "Lihat Pengajuan";
  if (job.kind === "turn") {
    const stage = current?.stage ? STAGE_LABEL[current.stage as Stage] : `tahap ${job.position}`;
    subject = `[${typeLabel}] Menunggu approval Anda (${stage}) - ${subjectNumber}`;
    intro = `Ada pengajuan ${typeLabel} yang menunggu keputusan Anda sebagai ${stage}.`;
    if (job.event_action === "resubmit") intro += ` Pemohon telah mengirim revisi (putaran ${job.cycle}).`;
    if (job.event_action === "reassign") intro += " Tahap ini dialihkan kepada Anda oleh Admin.";
  } else {
    const info: Record<string, [string, string]> = {
      approve: ["Disetujui, lanjut ke tahap berikutnya", `Pengajuan disetujui oleh ${actor} dan diteruskan ke tahap berikutnya.${note}`],
      approve_final: ["Disetujui final", `Pengajuan disetujui final oleh ${actor}. Project dibuat dan pengerjaan dapat dimulai.${note}`],
      revision: ["Dikembalikan untuk revisi", `${actor} mengembalikan pengajuan untuk direvisi.${note}${isRequester ? "\n\nSilakan perbaiki lalu kirim ulang. Approval akan dimulai lagi dari tahap pertama." : ""}`],
      reject: ["Ditolak", `${actor} menolak pengajuan.${note}`],
      adjust_budget: ["Budget diubah", `${actor} mengubah budget pengajuan.${note}`],
      resubmit: ["Revisi dikirim ulang", `${actor} mengirim ulang pengajuan setelah revisi (putaran ${job.cycle}). Approval dimulai lagi dari tahap pertama.`],
    };
    const [title, body] = info[job.event_action] ?? ["Pembaruan pengajuan", `Ada pembaruan pada pengajuan ini oleh ${actor}.${note}`];
    subject = `[${typeLabel}] ${title} - ${subjectNumber}`;
    intro = body;
    if (job.event_action === "revision" && isRequester && run.state === "revision") button = "Perbaiki Pengajuan";
  }

  const details = [
    `Nomor: ${number}`,
    `Aplikasi/proyek: ${name}`,
    `Pemohon: ${requester}`,
    `Departemen: ${document.departemen}`,
    `Biaya: ${cost > 0 ? rupiah(cost) : "Tanpa biaya"}`,
    `Posisi saat ini: ${positionLine(run, current)}`,
  ].join("\n");
  const text = `Halo ${job.full_name},\n\n${intro}\n\n${details}\n\nLihat pengajuan: ${link}\n\nSilakan login dengan akun Anda untuk membaca detail${job.kind === "turn" ? " dan mengambil keputusan" : ""}. Jika pengajuan sudah diproses, halaman akan menampilkan status terbaru.`;
  return {
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937"><p>${escapeHtml(text).replace(/\n/g, "<br>\n")}</p><p><a style="display:inline-block;background:#4f46e5;color:white;padding:12px 20px;text-decoration:none;border-radius:8px" href="${escapeHtml(link)}">${button}</a></p></div>`,
  };
}

export type MailSender = (settings: MailSettings, email: string, name: string, message: ReturnType<typeof approvalEmailMessage>, messageId: string) => Promise<void>;

const smtpSender: MailSender = async (settings, email, name, message, messageId) => {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.encryption === "ssl",
    requireTLS: settings.encryption === "tls",
    auth: { user: settings.username, pass: settings.password },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await transport.sendMail({
    from: { name: settings.fromName, address: settings.fromEmail },
    to: { name, address: email },
    subject: message.subject,
    text: message.text,
    html: message.html,
    messageId,
  });
};

// A database lock serializes workers; SMTP runs only after the approval transaction commits.
export async function dispatchApprovalEmails(limit = 10, runId: number | null = null, settings = mailSettings(), sender: MailSender = smtpSender) {
  const result = { sent: 0, pending: 0, skipped: 0 };
  if (!settings.enabled) return result;
  const conn = await db.getConnection();
  const lockName = `approval-mail-${createHash("sha1").update(String(await scalar(conn, "SELECT DATABASE()"))).digest("hex")}`;
  try {
    if (Number(await scalar(conn, "SELECT GET_LOCK(?, 0)", [lockName])) !== 1) return result;
    try {
      const jobs = await rows(conn, `SELECT q.*, r.document_type, r.document_id, u.full_name, u.email,
          e.action AS event_action, e.note AS event_note, e.actor_name
        FROM approval_email_queue q JOIN approval_runs r ON r.id = q.run_id JOIN users u ON u.id = q.recipient_id
        LEFT JOIN approval_events e ON e.id = q.event_id
        WHERE q.status = 'pending' AND q.next_attempt_at <= NOW()${runId !== null ? " AND q.run_id = ?" : ""}
        ORDER BY q.id LIMIT ${Math.max(1, Math.min(100, limit))}`, runId !== null ? [runId] : []);
      for (const job of jobs) {
        // Refresh the turn immediately before sending; skip decision requests left over from an older turn.
        const run = await row(conn, "SELECT state, cycle, current_position, requester_id FROM approval_runs WHERE id = ?", [job.run_id]);
        const current = run ? await row(conn, "SELECT stage, approver_id, approver_name, state FROM approval_steps WHERE run_id = ? AND cycle = ? AND position = ?", [job.run_id, run.cycle, run.current_position]) : null;
        const staleTurn = job.kind === "turn" && (!run || run.state !== "pending" || Number(run.cycle) !== Number(job.cycle) || Number(run.current_position) !== Number(job.position) || current?.state !== "waiting");
        if (!run || staleTurn) {
          await exec(conn, "UPDATE approval_email_queue SET status = 'skipped', last_error = NULL WHERE id = ?", [job.id]);
          result.skipped++;
          continue;
        }
        let error: string | null = null;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(job.email ?? ""))) {
          error = "Email penerima belum diisi atau tidak valid. Lengkapi di menu Users.";
        } else {
          try {
            const document = await row(conn, `SELECT * FROM ${approvalTable(job.document_type)} WHERE id = ?`, [job.document_id]);
            if (!document) throw new Error("Document missing");
            const message = approvalEmailMessage(job, document, run, current, settings);
            const domain = settings.fromEmail.split("@")[1] ?? "localhost";
            const identity = createHash("sha256").update(settings.baseUrl).digest("hex").slice(0, 16);
            await sender(settings, job.email, job.full_name, message, `<approval-${identity}-${job.id}@${domain}>`);
            await exec(conn, "UPDATE approval_email_queue SET status = 'sent', recipient_email = ?, attempts = attempts + 1, sent_at = NOW(), last_error = NULL WHERE id = ?", [job.email, job.id]);
            result.sent++;
          } catch {
            // SMTP responses may contain credentials or remote content; do not expose them.
            error = "Email belum berhasil dikirim. Periksa koneksi, akun SMTP, dan alamat penerima lalu coba lagi.";
          }
        }
        if (error !== null) {
          await exec(conn, "UPDATE approval_email_queue SET attempts = attempts + 1, last_error = ?, next_attempt_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE) WHERE id = ?", [error, job.id]);
          result.pending++;
        }
      }
    } finally {
      await scalar(conn, "SELECT RELEASE_LOCK(?)", [lockName]);
    }
  } finally {
    conn.release();
  }
  return result;
}

// Best effort after a submission/decision is saved; failures stay in the queue for the cron route.
export async function deliverDocumentApprovalEmail(type: DocType, id: number): Promise<void> {
  try {
    const runId = await scalar<number>(db, "SELECT id FROM approval_runs WHERE document_type = ? AND document_id = ?", [type, id]);
    if (runId) await dispatchApprovalEmails(20, Number(runId));
  } catch {
    console.error("Approval email dispatch deferred. Check the email queue.");
  }
}
