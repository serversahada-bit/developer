import type { Metadata } from "next";
import { canUseMenu, requireUser } from "@/lib/auth";
import { db, rows } from "@/lib/db";
import { AccessDenied } from "@/components/ui";
import { loadFormContext, revisionIdOf } from "../context";
import FpaaForm, { type FpaaValues } from "./FpaaForm";

export const metadata: Metadata = { title: "FPA-A - Formulir Perubahan Aplikasi" };

export default async function FpaaPage({ searchParams }: PageProps<"/pengajuan/fpa-a">) {
  const { revision: revisionParam } = await searchParams;
  const user = await requireUser("/pengajuan/fpa-a");
  const revisionId = revisionIdOf(revisionParam);
  if (!revisionId && !canUseMenu(user, "pengajuan")) return <AccessDenied user={user} />;

  const { context, revision, error } = await loadFormContext("fpaa", user, revisionParam);
  if (error) return <p className="mx-auto mt-16 max-w-xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">{error}</p>;
  const fpaOptions = await rows<{ nomor_fpa: string; nama_aplikasi: string }>(db, "SELECT nomor_fpa, nama_aplikasi FROM fpa_submissions WHERE nomor_fpa IS NOT NULL ORDER BY created_at DESC");

  const doc = revision?.document;
  const values: FpaaValues = {
    nomor_fpa_a: doc?.nomor_fpa_a ?? "Otomatis saat dikirim",
    nomor_fpa_utama: doc?.nomor_fpa_utama ?? "",
    nama_proyek: doc?.nama_proyek ?? "",
    jenis_perubahan: doc?.jenis_perubahan ? String(doc.jenis_perubahan).split(", ") : [],
    deskripsi_perubahan: revision?.scope ?? [],
    tambahan_waktu: doc?.tambahan_waktu != null ? String(doc.tambahan_waktu) : "",
    tambahan_biaya: doc?.tambahan_biaya ?? "",
    catatan: doc?.catatan ?? "",
  };
  return <FpaaForm context={context} values={values} revisionId={revisionId} fpaOptions={fpaOptions} />;
}
