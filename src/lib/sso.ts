import "server-only";
import { jwtVerify } from "jose";

// Token handed over by Great (absen-main) when a signed-in employee opens Developer. Contract:
//   HS256, signed with SSO_SECRET (shared with Great), aud "developer", exp at most 120 s after iat,
//   a unique jti, and user_id = absensi karyawan.id (the same id stored in users.karyawan_id).
export const SSO_AUDIENCE = "developer";

// jti values already used, so a token copied from history or logs cannot sign in again. Kept in
// memory: enough for a single server process; tokens expire within two minutes anyway.
const usedTokens = new Map<string, number>();

function rememberToken(jti: string, expiresAt: number): boolean {
  const now = Date.now();
  for (const [key, expiry] of usedTokens) if (expiry < now) usedTokens.delete(key);
  if (usedTokens.has(jti)) return false;
  usedTokens.set(jti, expiresAt);
  return true;
}

export async function verifySsoToken(token: string): Promise<{ karyawanId: number } | null> {
  const secret = process.env.SSO_SECRET;
  if (!secret || secret.length < 32 || !token) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
      audience: SSO_AUDIENCE,
      maxTokenAge: "120s",
      requiredClaims: ["exp", "iat", "jti"],
    });
    const karyawanId = Number(payload.user_id);
    if (!Number.isInteger(karyawanId) || karyawanId < 1) return null;
    if (!rememberToken(String(payload.jti), (payload.exp ?? 0) * 1000)) return null;
    return { karyawanId };
  } catch {
    return null;
  }
}
