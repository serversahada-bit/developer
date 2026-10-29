import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db, row } from "./db";
import { verifyKaryawanLogin } from "./identity";
import { MANAGER_MENUS, MANAGER_ROLES, MENUS, NON_ADMIN_MENUS, isMenuKey, menuByKey, type ManagerRole, type MenuDefinition, type MenuKey, type UserRole } from "./menus";
import { ensureUserForKaryawan } from "./users";
import { SESSION_COOKIE, sessionCookieOptions, signSession, verifySession } from "./session";

export interface CurrentUser {
  id: number;
  karyawan_id: number | null;
  full_name: string;
  username: string;
  role: UserRole;
  division: string | null;
  // Manager IT / Manager FAT roles held (approval_roles); they only approve FPA / FPA-A.
  managerRoles: ManagerRole[];
  menus: MenuKey[];
}

// Thrown by server actions for input or permission problems; the message is shown to the user.
export class UserError extends Error {}

// The signed-in account, read fresh from the database once per request.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const userId = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const found = await row<Omit<CurrentUser, "menus" | "managerRoles"> & { manager_roles: string | null }>(db, `SELECT id, karyawan_id, full_name, username, role, division,
    (SELECT GROUP_CONCAT(role_key) FROM approval_roles WHERE user_id = users.id) AS manager_roles FROM users WHERE id = ?`, [userId]);
  if (!found) return null;
  const { manager_roles: held, ...user } = found;
  const managerRoles = MANAGER_ROLES.filter((role) => (held ?? "").split(",").includes(role));
  const menus = user.role === "Admin" ? MENUS.map((m) => m.key) : managerRoles.length ? [...MANAGER_MENUS] : [...NON_ADMIN_MENUS];
  return { ...user, managerRoles, menus };
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

// Landing page: the first menu in the account's own order (Projects for Admin, Buat Pengajuan for
// everyone else); null when none is granted.
export function userHomeMenu(user: CurrentUser): MenuDefinition | null {
  return user.menus.length ? menuByKey(user.menus[0]) : null;
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
  // A karyawan without an account yet gets one (Buat Pengajuan only), as with SSO from Great.
  try {
    return [await ensureUserForKaryawan(check.karyawanId), null];
  } catch (error) {
    console.error("Create account for karyawan failed:", error);
    return [null, "Akun Anda belum berhasil disiapkan. Silakan coba beberapa saat lagi."];
  }
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
