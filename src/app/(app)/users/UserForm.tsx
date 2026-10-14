"use client";

import { useRef } from "react";
import Link from "next/link";
import { Save, UserPen } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { USER_DIVISIONS, USER_ROLES, type MenuDefinition } from "@/lib/menus";
import { createUserAction, updateUserAction } from "./actions";

export interface KaryawanOption {
  id: number;
  label: string;
  nama: string;
  nama_user: string;
  email: string;
}

export interface UserFormValues {
  karyawan_id: string;
  full_name: string;
  username: string;
  email: string;
  role: string;
  division: string;
}

const inputClass = "w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500";

export default function UserForm({ editId, editingLocal, values, karyawanOptions, menus }: {
  editId: number;
  editingLocal: boolean;
  values: UserFormValues;
  karyawanOptions: KaryawanOption[] | null;
  menus: MenuDefinition[];
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Fill only empty fields so values the Admin already typed are kept.
  function prefill(id: string) {
    const option = karyawanOptions?.find((k) => String(k.id) === id);
    if (!option) return;
    for (const [ref, value] of [[nameRef, option.nama], [usernameRef, option.nama_user], [emailRef, option.email]] as const) {
      if (ref.current && !ref.current.value && value) ref.current.value = value;
    }
  }

  return (
    <section id="user-form" className="rounded-xl border border-gray-200 bg-white p-5 md:p-6">
      <h2 className="mb-5 flex items-center gap-2 text-lg font-bold text-gray-900"><UserPen className="h-5 w-5 text-indigo-600" aria-hidden="true" />{editId ? "Edit User" : "Tambah User"}</h2>
      <ActionForm key={editId} action={editId ? updateUserAction.bind(null, editId) : createUserAction} className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {(pending) => (
          <>
            <div className="md:col-span-2">
              <label htmlFor="karyawan_id" className="mb-2 block text-sm font-medium text-gray-700">Karyawan (aplikasi Absensi)</label>
              {karyawanOptions === null ? (
                <>
                  {values.karyawan_id && <input type="hidden" name="karyawan_id" value={values.karyawan_id} />}
                  <p className="text-sm text-amber-700">Daftar karyawan belum dapat dimuat.</p>
                </>
              ) : (
                <select id="karyawan_id" name="karyawan_id" required={!editingLocal} defaultValue={values.karyawan_id} onChange={(e) => prefill(e.target.value)} className={`${inputClass} bg-white`}>
                  <option value="">{editingLocal ? "Tetap akun lokal (tidak dihubungkan)" : "Pilih karyawan"}</option>
                  {karyawanOptions.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
              )}
              <p className="mt-1 text-xs text-gray-500">
                {editingLocal
                  ? "Akun lokal login dengan password di bawah. Jika dihubungkan ke karyawan, akun ini login memakai akun Absensi dan password lokal tidak dipakai lagi."
                  : "User login memakai username/Gmail dan password karyawan ini di aplikasi Absensi. Nama, username, dan email yang masih kosong diisi otomatis dari data karyawan."}
              </p>
            </div>
            <div>
              <label htmlFor="full_name" className="mb-2 block text-sm font-medium text-gray-700">Nama lengkap</label>
              <input ref={nameRef} id="full_name" name="full_name" defaultValue={values.full_name} maxLength={100} required autoComplete="off" placeholder="Nama anggota tim" className={inputClass} />
            </div>
            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-medium text-gray-700">Username</label>
              <input ref={usernameRef} id="username" name="username" defaultValue={values.username} minLength={3} maxLength={50} pattern="[a-zA-Z0-9._\-]{3,50}" required autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="contoh: budi.spv" className={inputClass} />
              <p className="mt-1 text-xs text-gray-500">3–50 karakter, tanpa spasi.</p>
            </div>
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">Email</label>
              <input ref={emailRef} type="email" id="email" name="email" defaultValue={values.email} maxLength={254} required autoComplete="off" placeholder="nama@perusahaan.com" className={inputClass} />
            </div>
            <div>
              <label htmlFor="role" className="mb-2 block text-sm font-medium text-gray-700">Jabatan</label>
              <select id="role" name="role" required defaultValue={values.role} className={`${inputClass} bg-white`}>
                <option value="">Pilih jabatan</option>
                {USER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
              <p className="mt-1 text-xs text-gray-500">User dengan jabatan Admin dapat membuat akun baru.</p>
            </div>
            <div>
              <label htmlFor="division" className="mb-2 block text-sm font-medium text-gray-700">Divisi</label>
              <select id="division" name="division" required defaultValue={values.division} className={`${inputClass} bg-white`}>
                <option value="">Pilih divisi</option>
                {USER_DIVISIONS.map((division) => <option key={division} value={division}>{division}</option>)}
              </select>
            </div>
            {editingLocal && (
              <>
                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-700">Password lokal baru (opsional)</label>
                  <p className="mb-2 text-xs text-gray-500">Kosongkan kedua kolom password untuk memakai password lama.</p>
                  <input type="password" id="password" name="password" minLength={8} maxLength={72} autoComplete="new-password" placeholder="Minimal 8 karakter" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="password_confirmation" className="mb-2 block text-sm font-medium text-gray-700">Konfirmasi password</label>
                  <input type="password" id="password_confirmation" name="password_confirmation" minLength={8} maxLength={72} autoComplete="new-password" placeholder="Ulangi password" className={inputClass} />
                </div>
              </>
            )}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 md:col-span-2">
              <p className="font-medium text-gray-700">Akses menu mengikuti jabatan</p>
              <p className="mt-1 text-xs text-gray-500">Admin dapat membuka semua menu. Jabatan lain hanya dapat membuka {menus.map((menu) => menu.label).join(" dan ")}. Detail pengajuan dari link email tetap dapat dibuka oleh pemohon dan approver-nya.</p>
            </div>
            <div className="flex flex-wrap justify-end gap-3 md:col-span-2">
              {editId > 0 && <Link href="/users" className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm">Batal Edit</Link>}
              <button type="submit" disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 sm:w-auto">
                <Save className="h-4 w-4" aria-hidden="true" /> {editId ? "Simpan Perubahan" : "Simpan User"}
              </button>
            </div>
          </>
        )}
      </ActionForm>
    </section>
  );
}
