import { NextResponse, type NextRequest } from "next/server";
import { allowedLoginDestination } from "@/lib/auth";
import { ensureUserForKaryawan } from "@/lib/users";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";
import { findKaryawanById, karyawanInactive } from "@/lib/identity";
import { verifySsoToken } from "@/lib/sso";

// Per-user and single-use: never cache, or a proxy could replay one person's sign-in to others.
export const dynamic = "force-dynamic";

// Public origin of the app; behind a reverse proxy request.url may be the internal container address.
function appOrigin(request: NextRequest): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/+$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

// Receives the sign-in hand-over from Great: /sso?token=...&next=/tasks
export async function GET(request: NextRequest) {
  const origin = appOrigin(request);
  const noStore = { headers: { "Cache-Control": "no-store" } };
  const fail = (code: string) => NextResponse.redirect(`${origin}/login?error=${code}`, noStore);

  const verified = await verifySsoToken(request.nextUrl.searchParams.get("token") ?? "");
  if (!verified) return fail("sso");

  // Check the employee again so a deactivated account cannot use a token issued moments earlier.
  let karyawan;
  try {
    karyawan = await findKaryawanById(verified.karyawanId);
  } catch {
    return fail("unavailable");
  }
  if (!karyawan || karyawanInactive(karyawan)) return fail("inactive");
  // First visit of a karyawan without an account: one is created with Buat Pengajuan only.
  let userId;
  try {
    userId = await ensureUserForKaryawan(verified.karyawanId);
  } catch (error) {
    console.error("SSO account creation failed:", error);
    return fail("unavailable");
  }

  const next = allowedLoginDestination(request.nextUrl.searchParams.get("next"));
  const response = NextResponse.redirect(`${origin}${next}`, noStore);
  response.cookies.set(SESSION_COOKIE, await signSession(userId), sessionCookieOptions());
  return response;
}
