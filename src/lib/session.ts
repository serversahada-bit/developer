import { SignJWT, jwtVerify } from "jose";

// Signed session cookie. It only carries the users.id; the account (role, menus, division) is read
// from the database on every request, so Admin changes apply immediately, as the PHP session did.

export const SESSION_COOKIE = "developer_session";
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

function sessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET wajib diisi (minimal 32 karakter) di .env.local.");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(userId: number): Promise<string> {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(sessionSecret());
}

export async function verifySession(token: string | undefined): Promise<number | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    return typeof payload.uid === "number" && payload.uid > 0 ? payload.uid : null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}
