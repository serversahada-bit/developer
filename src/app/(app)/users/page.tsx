import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { managerHolders, timItMembers } from "@/lib/approval";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { karyawanInactive, loadKaryawan, type Karyawan } from "@/lib/identity";
import { MANAGER_MENUS, MANAGER_ROLE_LABEL, MANAGER_ROLES, NON_ADMIN_MENUS, menuByKey } from "@/lib/menus";
import { listUsers } from "@/lib/users";
import ActionForm, { SubmitButton } from "@/components/ActionForm";
import { Notice } from "@/components/ui";
import { deleteUserAction, saveManagerRolesAction } from "./actions";
import UserForm, { type KaryawanOption, type UserFormValues } from "./UserForm";

export const metadata: Metadata = { title: "Users" };

const SAVED: Record<string, string> = {
  created: "User berhasil dibuat.",
  updated: "Perubahan user berhasil disimpan.",
  deleted: "User berhasil dihapus.",
  roles: "Manager IT dan Manager FAT disimpan. Dokumen yang sedang menunggu peran tersebut dialihkan ke akun baru.",
};

const idParam = (value: unknown) => (typeof value === "string" && /^[1-9][0-9]{0,9}$/.test(value) ? Number(value) : 0);

export default async function UsersPage({ searchParams }: PageProps<"/users">) {
  const user = await requireUser("/users");
  if (user.role !== "Admin") {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <h1 className="text-xl font-bold">Akses dibatasi</h1>
          <p className="mt-2 text-sm text-gray-600">Hanya Admin yang dapat mengelola user.</p>
        </div>
      </main>
    );
  }
  const params = await searchParams;
  const editId = idParam(params.edit);
  const deleteId = idParam(params.delete);

  // Accounts sign in with the Absensi app's karyawan credentials, so the employee list comes from there.
  let karyawan: Map<number, Karyawan> | null = null;
  try {
    karyawan = await loadKaryawan();
  } catch (error) {
    console.error("Load karyawan failed:", (error as Error).message);
  }

  const users = await listUsers();
  const nonAdminMenus = NON_ADMIN_MENUS.map(menuByKey);
  const holders = await managerHolders(db);
  const timIt = await timItMembers(db);
  const managerIds = new Set(Object.values(holders).map((holder) => holder.id));

  const editing = editId ? users.find((u) => u.id === editId) : undefined;
  const deleting = deleteId ? users.find((u) => u.id === deleteId) : undefined;
  const errors: string[] = [];
  if (editId && !editing) errors.push("User yang akan diedit tidak ditemukan.");
  if (deleteId && !deleting) errors.push("User yang akan dihapus tidak ditemukan.");

  const values: UserFormValues = editing
    ? { karyawan_id: editing.karyawan_id ? String(editing.karyawan_id) : "", full_name: editing.full_name, username: editing.username, email: editing.email ?? "", role: editing.role, division: editing.division ?? "" }
    : { karyawan_id: "", full_name: "", username: "", email: "", role: "", division: "" };

  // Karyawan already linked to another account, and inactive ones, are left out of the choices.
  const linked = new Set(users.filter((u) => u.karyawan_id !== null && u.id !== editing?.id).map((u) => Number(u.karyawan_id)));
  const karyawanOptions: KaryawanOption[] | null = karyawan === null ? null : [...karyawan.values()]
    .filter((k) => String(k.id) === values.karyawan_id || (!linked.has(k.id) && !karyawanInactive(k)))
    .map((k) => ({ id: k.id, label: `${k.nama} (${k.nama_user})${karyawanInactive(k) ? " - Non-Aktif" : ""}`, nama: k.nama ?? "", nama_user: k.nama_user ?? "", email: k.email ?? "" }));

  const accounts = users.map((u) => ({ id: u.id, label: `${u.full_name} (@${u.username}) · ${u.role}${u.division ? ` ${u.division}` : ""}` }));
  const saved = typeof params.saved === "string" ? SAVED[params.saved] : undefined;

  return (
    <main className="bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-5">
        <p className="mb-1 text-xs text-gray-400">IT PSLU / Pengaturan</p>
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="mt-1 text-sm text-gray-500">Kelola akun, email, jabatan, divisi, dan peran approval FPA / FPA-A.</p>
      </header>
      <div className="space-y-6 p-4 md:p-6 lg:p-8">
        {saved && <Notice>{saved}</Notice>}
        {errors.length > 0 && <Notice tone="error">{errors.join(" ")}</Notice>}
        {karyawan === null && (
          <Notice tone="warning">Data karyawan dari aplikasi Absensi tidak dapat dimuat. Akun baru belum dapat dibuat dan karyawan yang terhubung belum dapat diganti. Silakan coba beberapa saat lagi.</Notice>
        )}

        {deleting && (
          <section id="delete-user" className="rounded-xl border border-red-200 bg-red-50 p-5">
            <h2 className="font-bold text-red-900">Hapus User</h2>
            <p className="mt-2 text-sm text-red-800">Hapus akun <strong>{deleting.full_name} (@{deleting.username})</strong>? Akun yang masih digunakan dalam approval atau riwayat pengajuan tidak dapat dihapus.</p>
            <ActionForm action={deleteUserAction} messagePosition="bottom" className="mt-4">
              <input type="hidden" name="user_id" value={deleting.id} />
              <div className="flex flex-wrap gap-3">
                <SubmitButton className="rounded-lg bg-red-600 px-4 py-2 text-white disabled:opacity-60">Ya, Hapus User</SubmitButton>
                <Link href="/users" className="rounded-lg border border-gray-300 bg-white px-4 py-2">Batal</Link>
              </div>
            </ActionForm>
          </section>
        )}

        <section id="approval-roles" className="rounded-xl border border-gray-200 bg-white p-5 md:p-6">
          <h2 className="text-lg font-bold text-gray-900">Approval FPA &amp; FPA-A</h2>
          <p className="mb-5 mt-1 text-sm text-gray-500">
            Urutan approval berlaku untuk semua pemohon: Atasan langsung (dari Absensi) → Tim IT → Manager IT → Manager FAT (hanya jika ada biaya).
            Manager IT dan Manager FAT hanya menyetujui, tidak dapat mengajukan.
          </p>
          <ActionForm action={saveManagerRolesAction} className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            {MANAGER_ROLES.map((role) => (
              <div key={role}>
                <label htmlFor={`role-${role}`} className="mb-2 block text-sm font-medium">{MANAGER_ROLE_LABEL[role]}</label>
                <select id={`role-${role}`} name={role} required defaultValue={holders[role]?.id ?? ""} className="w-full rounded-lg border bg-white p-2.5">
                  <option value="">Pilih akun</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
                </select>
              </div>
            ))}
            <SubmitButton className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">Simpan</SubmitButton>
          </ActionForm>
          <div className="mt-5 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
            <span className="font-medium text-gray-800">Tim IT</span> (akun berjabatan Admin di divisi IT, cukup satu yang menyetujui):{" "}
            {timIt.length ? timIt.map((member) => member.full_name).join(", ") : <span className="font-semibold text-red-700">belum ada. Atur jabatan Admin dan divisi IT pada akun anggota Tim IT.</span>}
          </div>
        </section>

        <UserForm editId={editing?.id ?? 0} editingLocal={Boolean(editing && editing.karyawan_id === null)} values={values} karyawanOptions={karyawanOptions} menus={nonAdminMenus} />

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
            <h2 className="text-lg font-bold text-gray-900">Daftar User</h2>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{users.length} user</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>{["Nama", "Karyawan Absensi", "Username", "Email", "Jabatan", "Divisi", "Menu", "Tanggal dibuat", "Aksi"].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-5 py-3">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((account) => {
                  const linkedKaryawan = account.karyawan_id === null ? null : karyawan?.get(Number(account.karyawan_id));
                  return (
                    <tr key={account.id}>
                      <td className="px-5 py-4 font-medium text-gray-900">
                        {account.full_name}{account.id === user.id && <span className="text-xs text-gray-400"> (Anda)</span>}
                        {MANAGER_ROLES.filter((role) => holders[role]?.id === account.id).map((role) => (
                          <span key={role} className="ml-2 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{MANAGER_ROLE_LABEL[role]}</span>
                        ))}
                      </td>
                      <td className="px-5 py-4 text-gray-600">
                        {account.karyawan_id === null ? (
                          <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">Akun lokal</span>
                        ) : karyawan === null ? (
                          <>Karyawan #{account.karyawan_id}</>
                        ) : !linkedKaryawan ? (
                          <span className="text-red-700">Tidak ditemukan di Absensi</span>
                        ) : (
                          <>
                            {linkedKaryawan.nama}
                            <div className="text-xs text-gray-400">{linkedKaryawan.nama_user}{karyawanInactive(linkedKaryawan) && <span className="text-red-700"> &middot; Non-Aktif</span>}</div>
                          </>
                        )}
                      </td>
                      <td className="px-5 py-4 text-gray-600">{account.username}</td>
                      <td className="px-5 py-4 text-gray-600">{account.email || "Belum diisi"}</td>
                      <td className="px-5 py-4"><span className="inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{account.role}</span></td>
                      <td className="px-5 py-4 text-gray-600">{account.division || "Belum diisi"}</td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <span className="text-gray-600">{account.role === "Admin" ? "Semua menu" : (managerIds.has(account.id) ? MANAGER_MENUS.map(menuByKey) : nonAdminMenus).map((menu) => menu.label).join(", ")}</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-gray-500">{formatDate(account.created_at, "d M Y H:i")}</td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <div className="flex gap-2">
                          <Link href={`/users?edit=${account.id}#user-form`} className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-3 py-2 text-indigo-700"><Pencil className="h-3 w-3" aria-hidden="true" />Edit</Link>
                          {account.id !== user.id && (
                            <Link href={`/users?delete=${account.id}#delete-user`} className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-red-700"><Trash2 className="h-3 w-3" aria-hidden="true" />Hapus</Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
