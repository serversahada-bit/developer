import type { Metadata } from "next";
import { canUseMenu, requireUser } from "@/lib/auth";
import { todayWib } from "@/lib/dates";
import { AccessDenied } from "@/components/ui";
import { loadFormContext, revisionIdOf } from "../context";
import FpaForm, { type FpaValues } from "./FpaForm";

export const metadata: Metadata = { title: "FPA - Form Pengajuan Aplikasi" };

export default async function FpaPage({ searchParams }: PageProps<"/pengajuan/fpa">) {
  const { revision: revisionParam } = await searchParams;
  const user = await requireUser("/pengajuan/fpa");
  const revisionId = revisionIdOf(revisionParam);
  // A revision is reachable from the detail page without the Pengajuan menu; ownership is checked below.
  if (!revisionId && !canUseMenu(user, "pengajuan")) return <AccessDenied user={user} />;

  const { context, revision, error } = await loadFormContext("fpa", user, revisionParam);
  if (error) return <p className="mx-auto mt-16 max-w-xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">{error}</p>;

  const doc = revision?.document;
  const values: FpaValues = {
    nomor_fpa: doc?.nomor_fpa ?? "Otomatis saat dikirim",
    tanggal_pengajuan: doc?.tanggal_pengajuan ?? todayWib(),
    nama_head: doc?.nama_head ?? "",
    rahasia: Boolean(doc?.rahasia),
    nama_aplikasi: doc?.nama_aplikasi ?? "",
    urgensi: doc?.urgensi ?? "",
    masalah: doc?.masalah ?? "",
    solusi: revision?.scope ?? [],
    dampak_bisnis: doc?.dampak_bisnis ?? "",
    metode_eksekusi: doc?.metode_eksekusi ? String(doc.metode_eksekusi).split(", ") : [],
    status_biaya: doc?.status_biaya ?? "",
    skala_aplikasi: doc?.skala_aplikasi ?? "",
    estimasi_durasi: doc?.estimasi_durasi != null ? String(doc.estimasi_durasi) : "",
    estimasi_biaya: doc?.estimasi_biaya ?? "",
    catatan_server: doc?.catatan_teknis_server ?? "",
    catatan_lisensi: doc?.catatan_teknis_lisensi ?? "",
    catatan_integrasi: doc?.catatan_teknis_integrasi ?? "",
    catatan_hardware: doc?.catatan_teknis_hardware ?? "",
  };
  return <FpaForm context={context} values={values} revisionId={revisionId} />;
}
