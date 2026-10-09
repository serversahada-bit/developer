import "server-only";
import bcrypt from "bcryptjs";
import type { PoolConnection } from "mysql2/promise";
import { db, exec, isDuplicateKey, isForeignKeyBlock, row, rows, transaction } from "./db";
import { karyawanLinkError, type Karyawan } from "./identity";
import { USER_DIVISIONS, USER_ROLES, isMenuKey, type MenuKey } from "./menus";
import { str, strs } from "./form";

export interface UserValues {
  karyawan_id: number;
  full_name: string;
  username: string;
  email: string;
  role: string;
  division: string;
  password: string;
  password_confirmation: string;
  menus: MenuKey[];
}

class ManagedUserError extends Error {}

// bcrypt reads at most 72 bytes, so longer passwords are refused rather than silently truncated.
function passwordErrors(password: string, confirmation: string): string[] {
  const errors: string[] = [];
  if ([...password].length < 8 || Buffer.byteLength(password) > 72 || password.includes("\0")) {
    errors.push("Password minimal 8 karakter. Jika terlalu panjang, gunakan password yang lebih singkat.");
  }
  if (password !== confirmation) errors.push("Konfirmasi password tidak sama.");
  return errors;
}

export function validateUserInput(form: FormData): [UserValues, string[]] {
  const karyawanRaw = str(form, "karyawan_id").trim();
  const menus = strs(form, "menus");
  const values: UserValues = {
    karyawan_id: /^[1-9][0-9]{0,9}$/.test(karyawanRaw) ? Number(karyawanRaw) : 0,
    full_name: str(form, "full_name").trim(),
    username: str(form, "username").trim(),
    email: str(form, "email").trim(),
    role: str(form, "role"),
    division: str(form, "division").trim(),
    password: str(form, "password"),
    password_confirmation: str(form, "password_confirmation"),
    menus: [...new Set(menus.filter(isMenuKey))],
  };
  const errors: string[] = [];
  if (values.full_name === "" || [...values.full_name].length > 100) errors.push("Nama lengkap wajib diisi, maksimal 100 karakter.");
  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(values.username)) errors.push("Username harus 3–50 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.");
  if (!(USER_ROLES as readonly string[]).includes(values.role)) errors.push("Pilih jabatan yang tersedia.");
  if (!(USER_DIVISIONS as readonly string[]).includes(values.division)) errors.push("Pilih divisi yang tersedia.");
  if (values.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.push("Masukkan alamat email yang valid, maksimal 254 karakter.");
  if (!menus.every(isMenuKey)) errors.push("Pilihan menu tidak valid.");
  return [values, errors];
}

export function duplicateUserMessage(): string {
  return "Username, email, atau karyawan tersebut sudah digunakan oleh user lain.";
}

async function saveUserMenus(tx: PoolConnection, userId: number, keys: MenuKey[]): Promise<void> {
  await exec(tx, "DELETE FROM user_menu_access WHERE user_id = ?", [userId]);
  for (const key of keys) await exec(tx, "INSERT INTO user_menu_access (user_id, menu_key) VALUES (?, ?)", [userId, key]);
}

// New accounts are always linked to a karyawan and sign in with their Absensi password.
// karyawanList is null when the Absensi database is unreachable.
export async function createUser(form: FormData, karyawanList: Map<number, Karyawan> | null): Promise<string[]> {
  const [values, errors] = validateUserInput(form);
  const linkError = karyawanLinkError(values.karyawan_id, karyawanList);
  if (linkError) errors.push(linkError);
  if (errors.length) return errors;
  try {
    await transaction(async (tx) => {
      const result = await exec(tx, "INSERT INTO users (karyawan_id, full_name, username, email, role, division) VALUES (?, ?, ?, ?, ?, ?)", [
        values.karyawan_id, values.full_name, values.username, values.email, values.role, values.division,
      ]);
      await saveUserMenus(tx, result.insertId, values.menus);
    });
  } catch (error) {
    if (isDuplicateKey(error)) return [duplicateUserMessage()];
    console.error("Create user failed:", error);
    return ["Akun belum berhasil disimpan. Silakan coba kembali."];
  }
  return [];
}

// Serialize account removal and role changes so the last Admin is always retained.
async function lockManagedUser(tx: PoolConnection, id: number, actorId: number) {
  const accounts = await rows<{ id: number; role: string; karyawan_id: number | null }>(tx, "SELECT id, role, karyawan_id FROM users ORDER BY id FOR UPDATE");
  const target = accounts.find((a) => a.id === id);
  const adminCount = accounts.filter((a) => a.role === "Admin").length;
  if (!accounts.some((a) => a.id === actorId && a.role === "Admin")) throw new ManagedUserError("Hanya Admin yang dapat mengelola user.");
  if (!target) throw new ManagedUserError("User tidak ditemukan.");
  return { target, adminCount };
}

// A linked account must stay linked (it may move to another karyawan). An unlinked local account
// may be linked, or keep its local password, which is only replaced when a new one is entered.
export async function updateUser(id: number, form: FormData, actorId: number, karyawanList: Map<number, Karyawan> | null): Promise<string[]> {
  const [values, errors] = validateUserInput(form);
  if (errors.length) return errors;
  try {
    await transaction(async (tx) => {
      const { target, adminCount } = await lockManagedUser(tx, id, actorId);
      if (target.role === "Admin" && values.role !== "Admin" && adminCount <= 1) {
        throw new ManagedUserError("Jabatan Admin terakhir tidak dapat diubah. Tambahkan Admin lain terlebih dahulu.");
      }
      const currentKaryawanId = Number(target.karyawan_id ?? 0);
      const karyawanId = values.karyawan_id;
      if ((currentKaryawanId || karyawanId) && karyawanId !== currentKaryawanId) {
        const linkError = karyawanLinkError(karyawanId, karyawanList);
        if (linkError) throw new ManagedUserError(linkError);
      }
      let sql = "UPDATE users SET full_name = ?, username = ?, email = ?, role = ?, division = ?, karyawan_id = ?";
      const params: (string | number | null)[] = [values.full_name, values.username, values.email, values.role, values.division, karyawanId || null];
      if (!karyawanId && (values.password !== "" || values.password_confirmation !== "")) {
        const problems = passwordErrors(values.password, values.password_confirmation);
        if (problems.length) throw new ManagedUserError(problems.join(" "));
        sql += ", password_hash = ?";
        // $2y$ keeps the hash readable by PHP password_verify() during the transition.
        params.push((await bcrypt.hash(values.password, 10)).replace(/^\$2[ab]\$/, "$2y$"));
      }
      params.push(id);
      await exec(tx, `${sql} WHERE id = ?`, params);
      await saveUserMenus(tx, id, values.menus);
    });
  } catch (error) {
    if (error instanceof ManagedUserError) return [error.message];
    if (isDuplicateKey(error)) return [duplicateUserMessage()];
    console.error("Update user failed:", error);
    return ["Perubahan user belum tersimpan. Silakan coba kembali."];
  }
  return [];
}

export async function deleteUser(id: number, actorId: number): Promise<string[]> {
  try {
    await transaction(async (tx) => {
      const { target, adminCount } = await lockManagedUser(tx, id, actorId);
      if (id === actorId) throw new ManagedUserError("Akun yang sedang Anda gunakan tidak dapat dihapus.");
      if (target.role === "Admin" && adminCount <= 1) throw new ManagedUserError("Admin terakhir tidak dapat dihapus.");
      const references: Record<string, string[]> = {
        approval_routes: ["approver_id"],
        approval_runs: ["requester_id"],
        approval_steps: ["approver_id"],
        approval_events: ["actor_id"],
        fpa_submissions: ["created_by_user_id"],
        fpa_a_submissions: ["created_by_user_id"],
        fpm_submissions: ["created_by_user_id", "estimasi_diisi_oleh"],
        submission_checklist_items: ["dev_done_by", "user_tested_by"],
      };
      for (const [table, columns] of Object.entries(references)) {
        const where = columns.map((column) => `${column} = ?`).join(" OR ");
        if (await row(tx, `SELECT 1 FROM ${table} WHERE ${where} LIMIT 1`, columns.map(() => id))) {
          throw new ManagedUserError("User masih terkait jalur approval atau riwayat pengajuan dan tidak dapat dihapus. Ubah jalur yang memakai user ini terlebih dahulu; akun dengan riwayat dokumen tetap dipertahankan.");
        }
      }
      await exec(tx, "DELETE FROM approval_routes WHERE requester_id = ?", [id]);
      await exec(tx, "DELETE FROM users WHERE id = ?", [id]);
    });
  } catch (error) {
    if (error instanceof ManagedUserError) return [error.message];
    if (isForeignKeyBlock(error)) return ["User masih digunakan oleh data lain dan tidak dapat dihapus."];
    console.error("Delete user failed:", error);
    return ["User belum berhasil dihapus. Silakan coba kembali."];
  }
  return [];
}

export interface UserListRow {
  id: number;
  karyawan_id: number | null;
  full_name: string;
  username: string;
  email: string | null;
  role: string;
  division: string | null;
  created_at: string;
}

export function listUsers(): Promise<UserListRow[]> {
  return rows<UserListRow>(db, "SELECT id, karyawan_id, full_name, username, email, role, division, created_at FROM users ORDER BY created_at DESC, id DESC");
}
