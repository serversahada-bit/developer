import "server-only";
import bcrypt from "bcryptjs";
import { absenDb, row, rows } from "./db";

// Employee identity from the Absensi app (absensi.karyawan). Every account except the local
// Administrator is linked to one karyawan through users.karyawan_id and signs in with that
// karyawan's Absensi credentials. This module is the single place that reads the Absensi
// database, so moving the account list itself to the karyawan table only touches this file
// and the account lookups in auth.ts.

export interface Karyawan {
  id: number;
  nama: string | null;
  nama_user: string | null;
  email: string | null;
  status_karyawan: string | null;
}

export function karyawanInactive(karyawan: Pick<Karyawan, "status_karyawan">): boolean {
  return (karyawan.status_karyawan ?? "") === "Non-Aktif";
}

// Every karyawan keyed by id, for choosing and showing the linked employee in Users.
export async function loadKaryawan(): Promise<Map<number, Karyawan>> {
  const list = await rows<Karyawan>(absenDb(), "SELECT id, nama, nama_user, email, status_karyawan FROM karyawan ORDER BY nama");
  return new Map(list.map((k) => [Number(k.id), { ...k, id: Number(k.id) }]));
}

export async function findKaryawanById(id: number): Promise<Karyawan | null> {
  return row<Karyawan>(absenDb(), "SELECT id, nama, nama_user, email, status_karyawan FROM karyawan WHERE id = ? LIMIT 1", [id]);
}

// What an account created automatically on first sign-in is filled from.
export interface KaryawanProfile extends Karyawan {
  jabatan: string | null;
  organisasi: string | null;
}

export async function findKaryawanProfile(id: number): Promise<KaryawanProfile | null> {
  return row<KaryawanProfile>(absenDb(), "SELECT id, nama, nama_user, email, status_karyawan, jabatan, organisasi FROM karyawan WHERE id = ? LIMIT 1", [id]);
}

// Same rule as the Absensi app: an email must be Gmail, anything else is the nama_user username.
async function findKaryawanForLogin(identifier: string): Promise<{ id: number; password: string | null; status_karyawan: string | null } | null> {
  let column: "email" | "nama_user";
  if (identifier.includes("@")) {
    if (!/^[^\s@]+@(?:gmail|googlemail)\.com$/i.test(identifier)) return null;
    column = "email";
  } else {
    column = "nama_user";
  }
  return row(absenDb(), `SELECT id, password, status_karyawan FROM karyawan WHERE ${column} = ? LIMIT 1`, [identifier]);
}

// Mirrors the Absensi app: bcrypt/argon2 hashes are verified, older plain-text passwords compared directly.
async function karyawanPasswordMatches(input: string, stored: string): Promise<boolean> {
  if (stored === "") return false;
  if (/^\$2[aby]\$/.test(stored)) {
    try {
      return await bcrypt.compare(input, stored.replace(/^\$2y\$/, "$2a$"));
    } catch {
      return false;
    }
  }
  // argon2 hashes cannot be verified without a native module; treat them as a mismatch.
  if (stored.startsWith("$argon2")) return false;
  return timingSafeEqual(stored, input);
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

export type KaryawanCheck =
  | { ok: true; karyawanId: number }
  | { ok: false; reason: "invalid" | "inactive" | "unreachable" };

// Verifies Absensi credentials. Never reveals whether the username exists.
export async function verifyKaryawanLogin(identifier: string, password: string): Promise<KaryawanCheck> {
  let karyawan;
  try {
    karyawan = await findKaryawanForLogin(identifier);
  } catch (error) {
    console.error("Absensi login lookup failed:", (error as Error).message);
    return { ok: false, reason: "unreachable" };
  }
  if (!karyawan || !(await karyawanPasswordMatches(password, String(karyawan.password ?? "")))) return { ok: false, reason: "invalid" };
  if (karyawanInactive(karyawan)) return { ok: false, reason: "inactive" };
  return { ok: true, karyawanId: Number(karyawan.id) };
}

export function karyawanLinkError(karyawanId: number, karyawanList: Map<number, Karyawan> | null): string | null {
  if (karyawanId < 1) return "Pilih karyawan yang akan dihubungkan.";
  if (karyawanList === null) return "Data karyawan dari aplikasi Absensi tidak dapat dimuat. Silakan coba kembali.";
  const karyawan = karyawanList.get(karyawanId);
  if (!karyawan || karyawanInactive(karyawan)) return "Pilih karyawan aktif dari aplikasi Absensi.";
  return null;
}
