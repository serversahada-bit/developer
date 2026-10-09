import "server-only";
import nodemailer from "nodemailer";
import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { db, exec, row, rows, scalar, type Row } from "./db";
import { approvalTable, detailUrl, type DocType } from "./documents";

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

// This insert belongs to the document transaction, so rolled-back decisions send no mail.
export async function queueApprovalEmail(tx: PoolConnection, type: DocType, documentId: number): Promise<void> {
  await exec(tx, `INSERT INTO approval_email_queue (run_id, cycle, position, recipient_id)
    SELECT r.id, r.cycle, r.current_position, s.approver_id FROM approval_runs r
    JOIN approval_steps s ON s.run_id = r.id AND s.cycle = r.cycle AND s.position = r.current_position
    WHERE r.document_type = ? AND r.document_id = ? AND r.state = 'pending' AND s.state = 'waiting'
    ON DUPLICATE KEY UPDATE id = approval_email_queue.id`, [type, documentId]);
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

function approvalEmailMessage(job: Row, document: Row, settings: MailSettings) {
  const isFpa = job.document_type === "fpa";
  const typeLabel = isFpa ? "FPA" : "FPA-A";
  const number = String(document[isFpa ? "nomor_fpa" : "nomor_fpa_a"] ?? "") || `#${job.document_id}`;
  const name = document[isFpa ? "nama_aplikasi" : "nama_proyek"];
  const requester = document[isFpa ? "nama_pemohon" : "user_nama"];
  const link = settings.baseUrl + detailUrl(job.document_type, Number(job.document_id));
  const text = `Halo ${job.full_name},\n\nAda pengajuan ${typeLabel} yang menunggu persetujuan Anda.\n\nNomor: ${number}\nAplikasi/proyek: ${name}\nPemohon: ${requester}\nDepartemen: ${document.departemen}\nTahap approval: ${job.position}\nPutaran: ${job.cycle}\n\nLihat pengajuan: ${link}\n\nSilakan login dengan akun Anda untuk membaca detail dan mengambil keputusan. Jika pengajuan sudah diproses, halaman akan menampilkan status terbaru.`;
  return {
    subject: `[${typeLabel}] Menunggu approval Anda - ${number.replace(/[\r\n]+/g, " ")}`,
    text,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937"><p>${escapeHtml(text).replace(/\n/g, "<br>\n")}</p><p><a style="display:inline-block;background:#4f46e5;color:white;padding:12px 20px;text-decoration:none;border-radius:8px" href="${escapeHtml(link)}">Lihat Pengajuan</a></p></div>`,
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
      const jobs = await rows(conn, `SELECT q.*, r.document_type, r.document_id, u.full_name, u.email
        FROM approval_email_queue q JOIN approval_runs r ON r.id = q.run_id JOIN users u ON u.id = q.recipient_id
        WHERE q.status = 'pending' AND q.next_attempt_at <= NOW()${runId !== null ? " AND q.run_id = ?" : ""}
        ORDER BY q.id LIMIT ${Math.max(1, Math.min(100, limit))}`, runId !== null ? [runId] : []);
      for (const job of jobs) {
        // Refresh the turn immediately before sending; skip jobs left over from an older turn.
        const run = await row(conn, "SELECT state, cycle, current_position FROM approval_runs WHERE id = ?", [job.run_id]);
        if (!run || run.state !== "pending" || Number(run.cycle) !== Number(job.cycle) || Number(run.current_position) !== Number(job.position)) {
          await exec(conn, "UPDATE approval_email_queue SET status = 'skipped', last_error = NULL WHERE id = ?", [job.id]);
          result.skipped++;
          continue;
        }
        let error: string | null = null;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(job.email ?? ""))) {
          error = "Email approver belum diisi atau tidak valid. Lengkapi di menu Users.";
        } else {
          try {
            const document = await row(conn, `SELECT * FROM ${approvalTable(job.document_type)} WHERE id = ?`, [job.document_id]);
            if (!document) throw new Error("Document missing");
            const message = approvalEmailMessage(job, document, settings);
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
    if (runId) await dispatchApprovalEmails(5, Number(runId));
  } catch {
    console.error("Approval email dispatch deferred. Check the email queue.");
  }
}
