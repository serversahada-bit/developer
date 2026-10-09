import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db, row, rows } from "./db";
import { verifyKaryawanLogin } from "./identity";
import { MENUS, isMenuKey, type MenuDefinition, type MenuKey, type UserRole } from "./menus";
import { SESSION_COOKIE, sessionCookieOptions, signSession, verifySession } from "./session";

export interface CurrentUser {
  id: number;
  karyawan_id: number | null;
  full_name: string;
  username: string;
  role: UserRole;
  division: string | null;
  menus: MenuKey[];
}

// Thrown by server actions for input or permission problems; the message is shown to the user.
export class UserError extends Error {}

async function storedMenuKeys(userId: number): Promise<MenuKey[]> {
  const granted = await rows<{ menu_key: string }>(db, "SELECT menu_key FROM user_menu_access WHERE user_id = ?", [userId]);
  const keys = new Set(granted.map((g) => g.menu_key));
  // Definition order, ignoring rows for menus that no longer exist.
  return MENUS.filter((menu) => keys.has(menu.key)).map((menu) => menu.key);
}

export { storedMenuKeys };

// The signed-in account, read fresh from the database once per request.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const userId = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const user = await row<Omit<CurrentUser, "menus">>(db, "SELECT id, karyawan_id, full_name, username, role, division FROM users WHERE id = ?", [userId]);
  if (!user) return null;
  const menus = user.role === "Admin" ? MENUS.map((m) => m.key) : await storedMenuKeys(user.id);
  return { ...user, menus };
});

// For pages: the signed-in account, or a redirect to the login page.
export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

export function canUseMenu(user: CurrentUser, key: MenuKey | MenuKey[]): boolean {
  if (user.role === "Admin") return true;
  return (Array.isArray(key) ? key : [key]).some((k) => user.menus.includes(k));
}

// First menu the account may open, used as its landing page; null when none is granted.
export function userHomeMenu(user: CurrentUser): MenuDefinition | null {
  return MENUS.find((menu) => user.menus.includes(menu.key)) ?? null;
}

// For server actions: the signed-in account with one of the menus, otherwise a UserError.
export async function requireActionUser(menu?: MenuKey | MenuKey[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UserError("Sesi Anda sudah berakhir. Silakan login kembali.");
  if (menu && !canUseMenu(user, menu)) throw new UserError("Anda tidak memiliki akses ke menu ini.");
  return user;
}

export function isAdmin(user: Pick<CurrentUser, "role">): boolean {
  return user.role === "Admin";
}

// Returns [users.id, null] to sign in, or [null, error]. Unlinked accounts (the local Administrator)
// keep their own password so they can still sign in when the Absensi database is unreachable.
export async function authenticateLogin(identifier: string, password: string): Promise<[number, null] | [null, string]> {
  const invalid: [null, string] = [null, "Username atau password salah!"];
  if (identifier === "" || password === "") return invalid;
  const local = await row<{ id: number; password_hash: string | null }>(
    db,
    "SELECT id, password_hash FROM users WHERE username = ? AND karyawan_id IS NULL",
    [identifier],
  );
  if (local?.password_hash && (await bcrypt.compare(password, local.password_hash.replace(/^\$2y\$/, "$2a$")))) {
    return [local.id, null];
  }
  const check = await verifyKaryawanLogin(identifier, password);
  if (!check.ok) {
    if (check.reason === "unreachable") return [null, "Data karyawan tidak dapat dihubungi. Silakan coba beberapa saat lagi."];
    if (check.reason === "inactive") return [null, "Akun Anda telah dinonaktifkan. Silakan hubungi HRD."];
    return invalid;
  }
  const userId = await userIdForKaryawan(check.karyawanId);
  if (!userId) return [null, "Akun Anda belum didaftarkan di aplikasi Developer. Hubungi Admin."];
  return [userId, null];
}

export async function userIdForKaryawan(karyawanId: number): Promise<number | null> {
  const found = await row<{ id: number }>(db, "SELECT id FROM users WHERE karyawan_id = ?", [karyawanId]);
  return found?.id ?? null;
}

export async function startSession(userId: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(userId), sessionCookieOptions());
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// Only local paths are allowed after login, so ?next= cannot send anyone to another site.
export function allowedLoginDestination(candidate: unknown): string {
  if (typeof candidate !== "string") return "/";
  if (!/^\/(?![/\\])[A-Za-z0-9/_-]*(?:\?[A-Za-z0-9=&_%-]*)?$/.test(candidate)) return "/";
  if (candidate.startsWith("/login") || candidate.startsWith("/sso")) return "/";
  return candidate;
}

export function menuKeysFromInput(values: unknown[]): { keys: MenuKey[]; valid: boolean } {
  const valid = values.every(isMenuKey);
  return { keys: [...new Set(values.filter(isMenuKey))], valid };
}
