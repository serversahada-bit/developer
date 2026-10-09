"use client";

import { useState } from "react";
import { ArrowLeftRight, Coins, FileSignature, PlusCircle } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import type { ScopeItem } from "@/lib/scope";
import { submitApprovalAction } from "../actions";
import { ApprovalNotice, DivisionField, FormButtons, FormHeader, NumberBadge, RequesterCard, ScopeItemsField, SectionHeader, type FormContext } from "../FormParts";

export interface FpaaValues {
  nomor_fpa_a: string;
  nomor_fpa_utama: string;
  nama_proyek: string;
  jenis_perubahan: string[];
  deskripsi_perubahan: ScopeItem[];
  tambahan_waktu: string;
  tambahan_biaya: string;
  catatan: string;
}

const CHANGE_TYPES = [
  { value: "Penambahan Fitur/Scope", icon: PlusCircle, color: "text-purple-500" },
  { value: "Perubahan Anggaran", icon: Coins, color: "text-yellow-500" },
  { value: "Perubahan Status", icon: ArrowLeftRight, color: "text-blue-500" },
];

export default function FpaaForm({ context, values, revisionId, fpaOptions }: { context: FormContext; values: FpaaValues; revisionId: number; fpaOptions: { nomor_fpa: string; nama_aplikasi: string }[] }) {
  // A parent number not in the list (typed manually earlier) reopens as manual input.
  const known = values.nomor_fpa_utama === "" || fpaOptions.some((fpa) => fpa.nomor_fpa === values.nomor_fpa_utama);
  const [parent, setParent] = useState(known ? values.nomor_fpa_utama : "--manual--");
  const manual = fpaOptions.length === 0 || parent === "--manual--";

  return (
    <div className="mx-auto max-w-4xl py-8">
      <FormHeader icon={<FileSignature className="h-6 w-6" />} tone="purple" title="Formulir Perubahan Aplikasi — Adendum"
        subtitle="FPA-A — Digunakan untuk mengajukan perubahan scope, anggaran, atau status dari FPA yang sudah berjalan" badge={<NumberBadge value={values.nomor_fpa_a} />} />
      <ApprovalNotice context={context} />
      <ActionForm action={submitApprovalAction.bind(null, "fpaa", revisionId)}>
        {(pending) => (
          <>
            <input type="hidden" name="cycle" value={context.revision?.cycle ?? 0} />
            <section className="form-section">
              <SectionHeader letter="A" tone="bg-purple-100 text-purple-700" title="Informasi Proyek Awal" subtitle="Referensi ke FPA yang sudah ada" />
              <div className="form-section-body grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label htmlFor="nomor_fpa_a" className="form-label">Nomor FPA-A <span className="text-red-500">*</span></label>
                  <input id="nomor_fpa_a" value={values.nomor_fpa_a} readOnly className="form-input" />
                </div>
                <div>
                  <label htmlFor="nomor_fpa_utama" className="form-label">Nomor FPA Utama (Referensi) <span className="text-red-500">*</span></label>
                  {fpaOptions.length > 0 && (
                    <select id="nomor_fpa_utama" name="nomor_fpa_utama" required value={parent} onChange={(e) => setParent(e.target.value)} className="form-input">
                      <option value="">-- Pilih Nomor FPA --</option>
                      {fpaOptions.map((fpa) => <option key={fpa.nomor_fpa} value={fpa.nomor_fpa}>{fpa.nomor_fpa} — {fpa.nama_aplikasi}</option>)}
                      <option value="--manual--">Input Manual...</option>
                    </select>
                  )}
                  {manual && (
                    <input id={fpaOptions.length ? "nomor_fpa_manual" : "nomor_fpa_utama"} name={fpaOptions.length ? "nomor_fpa_manual" : "nomor_fpa_utama"} required maxLength={50}
                      aria-label="Nomor FPA utama (manual)" defaultValue={known ? "" : values.nomor_fpa_utama} placeholder="FPA/ITS/001/06/2026" className={`form-input ${fpaOptions.length ? "mt-2" : ""}`} />
                  )}
                </div>
                <div>
                  <label htmlFor="nama_proyek" className="form-label">Nama Proyek <span className="text-red-500">*</span></label>
                  <input id="nama_proyek" name="nama_proyek" defaultValue={values.nama_proyek} maxLength={200} required placeholder="Nama proyek yang diajukan adendum" className="form-input" />
                </div>
                <RequesterCard user={context.user} tone="purple" label="User (PIC)" />
                <div className="md:col-span-2"><DivisionField division={context.user.division} /></div>
              </div>
            </section>

            <section className="form-section">
              <SectionHeader letter="B" tone="bg-orange-100 text-orange-700" title="Detail Perubahan (Addendum)" subtitle="Jelaskan secara rinci perubahan yang diajukan" />
              <div className="form-section-body space-y-5">
                <fieldset>
                  <legend className="form-label">Jenis Perubahan <span className="text-red-500">*</span></legend>
                  <div className="mt-1 grid grid-cols-1 gap-3 md:grid-cols-3">
                    {CHANGE_TYPES.map(({ value, icon: Icon, color }) => (
                      <label key={value} className="cursor-pointer rounded-xl border-2 border-gray-200 p-4 transition focus-within:ring-2 focus-within:ring-purple-300 has-[:checked]:border-purple-500 has-[:checked]:bg-purple-50">
                        <input type="checkbox" name="jenis_perubahan[]" value={value} defaultChecked={values.jenis_perubahan.includes(value)} className="sr-only" />
                        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800"><Icon className={`h-4 w-4 ${color}`} aria-hidden="true" />{value}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <ScopeItemsField field="deskripsi_perubahan" initial={values.deskripsi_perubahan} itemLabel="Fitur/Scope" tone="purple"
                  legend="Deskripsi Perubahan — Daftar Fitur/Scope"
                  help="Tuliskan satu fitur atau perubahan scope per item: isi nama fitur, lalu keterangan atau rumusnya. Maksimal 50 item; nama maksimal 200 karakter, keterangan maksimal 1.000 karakter."
                  namePlaceholder="Contoh: Ekspor laporan ke Excel" detailPlaceholder="Jelaskan cara kerja fitur atau rumus perhitungannya. Contoh: Laporan bulanan bisa diunduh dalam format .xlsx" />
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="tambahan_waktu" className="form-label">Tambahan Waktu (Hari Kerja/Kalender)</label>
                    <input type="number" id="tambahan_waktu" name="tambahan_waktu" defaultValue={values.tambahan_waktu} min={0} placeholder="0" className="form-input" />
                  </div>
                  <div>
                    <label htmlFor="tambahan_biaya" className="form-label">Tambahan Biaya (jika Berbayar)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-sm font-medium text-gray-400">Rp</span>
                      <input id="tambahan_biaya" name="tambahan_biaya" defaultValue={values.tambahan_biaya} placeholder="0" className="form-input pl-9" />
                    </div>
                  </div>
                </div>
                <div>
                  <label htmlFor="catatan" className="form-label">Catatan Tambahan</label>
                  <textarea id="catatan" name="catatan" defaultValue={values.catatan} rows={2} placeholder="Catatan lain yang relevan..." className="form-textarea" />
                </div>
              </div>
            </section>
            <FormButtons pending={pending} tone="purple" label={context.revision ? "Kirim Ulang Revisi" : "Kirim Pengajuan FPA-A"} />
          </>
        )}
      </ActionForm>
    </div>
  );
}
