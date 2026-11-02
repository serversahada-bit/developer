import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { dispatchApprovalEmails, dispatchFpmEmails } from "@/lib/email";

export const dynamic = "force-dynamic";

// Retries queued approval and FPM emails (replaces send_approval_emails.php). Schedule every minute:
//   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/approval-emails
export async function POST(request: NextRequest) {
  const secret = Buffer.from(process.env.CRON_SECRET ?? "");
  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
  // Byte lengths, not string lengths: timingSafeEqual throws on a multi-byte header of equal length.
  const valid = secret.length >= 32 && given.length === secret.length && timingSafeEqual(given, secret);
  if (!valid) return Response.json({ error: "unauthorized" }, { status: 401 });
  const approval = await dispatchApprovalEmails(20);
  const fpm = await dispatchFpmEmails(20);
  return Response.json({ ...approval, fpm });
}
