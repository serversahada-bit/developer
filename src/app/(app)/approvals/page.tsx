import type { Metadata } from "next";
import Link from "next/link";
import { Eye } from "lucide-react";
import { canUseMenu, requireUser } from "@/lib/auth";
import { approvalList, pendingApprovalCount, type ListView } from "@/lib/approval";
import { db, rows, type Row } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { detailUrl, type DetailType } from "@/lib/documents";
import { AccessDenied, StatusBadge } from "@/components/ui";
import Tabs from "@/components/Tabs";

export const metadata: Metadata = { title: "Approvals" };

interface Column {
  label: string;
  render: (row: Row) => React.ReactNode;
}

function DocumentTable({ type, list, columns, empty }: { type: DetailType; list: Row[]; columns: Column[]; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column) => <th key={column.label} scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{column.label}</th>)}
            <th scope="col" className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {list.map((item) => (
            <tr key={item.id}>
              {columns.map((column) => <td key={column.label} className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{column.render(item)}</td>)}
              <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                <Link href={detailUrl(type, Number(item.id))} className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-3 py-1.5 text-indigo-600 transition-colors hover:bg-indigo-100 hover:text-indigo-900">
                  <Eye className="h-3 w-3" aria-hidden="true" /> Detail
                </Link>
              </td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={columns.length + 1} className="px-6 py-4 text-center text-gray-500">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const statusColumn: Column = {
  label: "Status",
  render: (item) => (
    <>
      <StatusBadge status={item.status_dokumen} />
      {item.approval_label && <p className="mt-1 text-xs text-gray-600">{item.approval_label}</p>}
    </>
  ),
};

export default async function ApprovalsPage({ searchParams }: PageProps<"/approvals">) {
  const user = await requireUser("/approvals");
  if (!canUseMenu(user, "approvals")) return <AccessDenied user={user} />;

  const params = await searchParams;
  const view: ListView = params.view === "mine" || params.view === "all" ? params.view : "pending";
  const [fpaList, fpaaList, pendingCount, fpmList] = await Promise.all([
    approvalList("fpa", user, view),
    approvalList("fpaa", user, view),
    pendingApprovalCount(user),
    rows(db, "SELECT id, nama_sistem, nama_pelapor, jenis_kendala, status_dokumen, created_at FROM fpm_submissions ORDER BY created_at DESC"),
  ]);

  const filters: [ListView, string][] = [
    ["pending", `Menunggu Persetujuan Saya (${pendingCount})`],
    ["mine", "Pengajuan Saya"],
    ["all", user.role === "Admin" ? "Semua Pengajuan" : "Riwayat Terkait Saya"],
  ];
  const dateColumn = (label: string): Column => ({ label, render: (item) => formatDate(item.created_at, "d M Y") });

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-800">Approval Pengajuan</h1>
        <p className="mt-1 text-sm text-gray-500">Kelola dan setujui pengajuan FPA, FPA-A, dan Laporan FPM</p>
      </header>
      <main className="p-6">
        <nav className="mb-5 flex flex-wrap gap-2" aria-label="Filter approval FPA dan FPA-A">
          {filters.map(([key, label]) => (
            <Link key={key} href={`/approvals?view=${key}`} aria-current={view === key ? "page" : undefined}
              className={`rounded-lg border px-4 py-2 text-sm ${view === key ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-200 bg-white text-gray-700"}`}>
              {label}
            </Link>
          ))}
        </nav>
        <p className="mb-4 text-xs text-gray-500">Filter berlaku untuk FPA dan FPA-A. Laporan FPM tetap ditampilkan pada tab Maintenance.</p>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <Tabs label="Jenis pengajuan" tabs={[
            {
              id: "fpa", label: "FPA (Aplikasi Baru)",
              panel: <DocumentTable type="fpa" list={fpaList} empty="Tidak ada pengajuan FPA pada filter ini." columns={[
                dateColumn("Tanggal"),
                { label: "Nomor FPA", render: (item) => <span className="font-medium text-gray-900">{item.nomor_fpa}</span> },
                { label: "Aplikasi", render: (item) => item.nama_aplikasi },
                { label: "Pemohon", render: (item) => <>{item.nama_pemohon}<br /><span className="text-xs text-gray-400">{item.departemen}</span></> },
                statusColumn,
              ]} />,
            },
            {
              id: "fpaa", label: "FPA-A (Adendum)",
              panel: <DocumentTable type="fpaa" list={fpaaList} empty="Tidak ada pengajuan FPA-A pada filter ini." columns={[
                dateColumn("Tanggal"),
                { label: "Nomor FPA-A", render: (item) => <span className="font-medium text-gray-900">{item.nomor_fpa_a || "Draft"}</span> },
                { label: "Proyek", render: (item) => item.nama_proyek },
                { label: "Pemohon", render: (item) => <>{item.user_nama}<br /><span className="text-xs text-gray-400">{item.departemen}</span></> },
                statusColumn,
              ]} />,
            },
            {
              id: "fpm", label: "FPM (Maintenance)",
              panel: <DocumentTable type="fpm" list={fpmList} empty="Belum ada laporan FPM" columns={[
                dateColumn("Tanggal Lapor"),
                { label: "Sistem/Aplikasi", render: (item) => <span className="font-medium text-gray-900">{item.nama_sistem}</span> },
                { label: "Kendala", render: (item) => item.jenis_kendala },
                { label: "Pelapor", render: (item) => item.nama_pelapor },
                { label: "Status", render: (item) => <StatusBadge status={item.status_dokumen} /> },
              ]} />,
            },
          ]} />
        </div>
      </main>
    </>
  );
}
