"use client";

import { useState } from "react";
import { ArrowLeftRight as Exchange, FileText, KeyRound as Key, Lock, Monitor as Desktop, Server } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import type { ScopeItem } from "@/lib/scope";
import { submitApprovalAction } from "../actions";
import { ApprovalNotice, DivisionField, FormButtons, FormHeader, NumberBadge, RequesterCard, ScopeItemsField, SectionHeader, type FormContext } from "../FormParts";

export interface FpaValues {
  nomor_fpa: string;
  tanggal_pengajuan: string;
  nama_head: string;
  rahasia: boolean;
  nama_aplikasi: string;
  urgensi: string;
  masalah: string;
  solusi: ScopeItem[];
  dampak_bisnis: string;
  metode_eksekusi: string[];
  status_biaya: string;
  skala_aplikasi: string;
  estimasi_durasi: string;
  estimasi_biaya: string;
  catatan_server: string;
  catatan_lisensi: string;
  catatan_integrasi: string;
  catatan_hardware: string;
}

const URGENCY = [
  { value: "High", dot: "bg-red-500", checked: "has-[:checked]:border-red-500 has-[:checked]:bg-red-50", text: "Mendesak, menghambat operasional inti, berdampak langsung pada profit" },
  { value: "Medium", dot: "bg-yellow-500", checked: "has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50", text: "Penting, mendukung efisiensi, ada workaround manual" },
  { value: "Low", dot: "bg-green-500", checked: "has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50", text: "Fitur tambahan/penunjang, tidak kritis" },
];

export default function FpaForm({ context, values, revisionId }: { context: FormContext; values: FpaValues; revisionId: number }) {
  const [berbayar, setBerbayar] = useState(values.status_biaya === "Berbayar");
  const [biaya, setBiaya] = useState(values.estimasi_biaya);

  return (
    <div className="mx-auto max-w-4xl py-8">
      <FormHeader icon={<FileText className="h-6 w-6" />} tone="indigo" title="Form Pengajuan Aplikasi & Sistem IT"
        subtitle="FPA — Digunakan untuk mengajukan pembangunan aplikasi atau sistem baru" badge={<NumberBadge value={values.nomor_fpa} />} />
      <ApprovalNotice context={context} />
      <ActionForm action={submitApprovalAction.bind(null, "fpa", revisionId)}>
        {(pending) => (
          <>
            <input type="hidden" name="cycle" value={context.revision?.cycle ?? 0} />
            <section className="form-section">
              <SectionHeader letter="A" tone="bg-indigo-100 text-indigo-700" title="Identitas Pemohon" subtitle="Data diri pengaju pengajuan" />
              <div className="form-section-body grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label htmlFor="nomor_fpa" className="form-label">Nomor FPA <span className="text-red-500">*</span></label>
                  <input id="nomor_fpa" type="text" value={values.nomor_fpa} readOnly className="form-input" />
                </div>
                <div>
                  <label htmlFor="tanggal_pengajuan" className="form-label">Tanggal Pengajuan <span className="text-red-500">*</span></label>
                  <input type="date" id="tanggal_pengajuan" name="tanggal_pengajuan" defaultValue={values.tanggal_pengajuan} required className="form-input" />
                </div>
                <DivisionField division={context.user.division} />
                <RequesterCard user={context.user} tone="indigo" label="Pemohon" />
                <div className="md:col-span-2">
                  <label htmlFor="nama_head" className="form-label">Nama Head Department <span className="text-red-500">*</span></label>
                  <input id="nama_head" name="nama_head" defaultValue={values.nama_head} maxLength={100} required placeholder="Nama kepala departemen" className="form-input" />
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 md:col-span-2">
                  <input type="checkbox" name="rahasia" value="1" defaultChecked={values.rahasia} className="mt-0.5 rounded text-amber-600" />
                  <span>
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-900"><Lock className="h-3 w-3" />Rahasia</span>
                    <span className="mt-0.5 block text-xs text-amber-700">Kalau dicentang, detail pengajuan ini hanya terlihat oleh Anda, approver di jalur persetujuannya, dan Admin. User lain hanya melihat Nomor FPA, tanggal pengajuan, dan deadline pada halaman Task.</span>
                  </span>
                </label>
              </div>
            </section>

            <section className="form-section">
              <SectionHeader letter="B" tone="bg-blue-100 text-blue-700" title="Spesifikasi Permintaan (User Requirements)" subtitle="Jelaskan kebutuhan dan tujuan pengajuan" />
              <div className="form-section-body space-y-5">
                <div>
                  <label htmlFor="nama_aplikasi" className="form-label">Nama Aplikasi yang Diminta <span className="text-red-500">*</span></label>
                  <input id="nama_aplikasi" name="nama_aplikasi" defaultValue={values.nama_aplikasi} maxLength={200} required placeholder="Contoh: Sistem Absensi Mobile, Dashboard Penjualan Herbal..." className="form-input" />
                </div>
                <fieldset>
                  <legend className="form-label">Tingkat Urgensi <span className="text-red-500">*</span></legend>
                  <div className="mt-1 grid grid-cols-1 gap-3 md:grid-cols-3">
                    {URGENCY.map((option) => (
                      <label key={option.value} className={`cursor-pointer rounded-xl border-2 border-gray-200 p-4 transition focus-within:ring-2 focus-within:ring-indigo-300 ${option.checked}`}>
                        <input type="radio" name="urgensi" value={option.value} defaultChecked={values.urgensi === option.value} required className="sr-only" />
                        <div className="mb-1 flex items-center gap-2"><span className={`inline-block h-3 w-3 rounded-full ${option.dot}`} /><span className="font-bold text-gray-800">{option.value}</span></div>
                        <p className="text-xs text-gray-500">{option.text}</p>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div>
                  <label htmlFor="masalah" className="form-label">Masalah yang Dihadapi (Current Problem) <span className="text-red-500">*</span></label>
                  <textarea id="masalah" name="masalah" defaultValue={values.masalah} required rows={3} placeholder="Jelaskan kendala di lapangan jika aplikasi ini tidak ada..." className="form-textarea" />
                </div>
                <ScopeItemsField field="solusi" initial={values.solusi} itemLabel="Fitur/Solusi" tone="indigo"
                  legend="Solusi yang Diinginkan (Desired Solution)"
                  help="Tuliskan satu fitur atau solusi yang wajib ada per item: isi nama fitur, lalu keterangan atau rumusnya. Maksimal 50 item; nama maksimal 200 karakter, keterangan maksimal 1.000 karakter."
                  namePlaceholder="Contoh: Akses lintas perangkat" detailPlaceholder="Jelaskan cara kerja fitur atau rumus perhitungannya. Contoh: Aplikasi bisa diakses lewat HP dan Desktop" />
                <div>
                  <label htmlFor="dampak_bisnis" className="form-label">Dampak Bisnis / Efisiensi (Business Impact)</label>
                  <textarea id="dampak_bisnis" name="dampak_bisnis" defaultValue={values.dampak_bisnis} rows={2} placeholder="Contoh: Menghemat waktu 2 jam per hari, Mengurangi error data 50%..." className="form-textarea" />
                </div>
              </div>
            </section>

            <section className="form-section">
              <SectionHeader letter="C" tone="bg-purple-100 text-purple-700" title="Analisis Teknis" subtitle={<span className="flex items-center gap-1"><Lock className="h-3 w-3 text-purple-400" /> Diisi oleh Tim IT</span>} />
              <div className="form-section-body space-y-5">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                  <fieldset>
                    <legend className="form-label">Metode Eksekusi</legend>
                    <div className="mt-1 space-y-2">
                      {["In-House", "Outsource", "Lisensi"].map((m) => (
                        <label key={m} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" name="metode_eksekusi[]" value={m} defaultChecked={values.metode_eksekusi.includes(m)} className="rounded text-indigo-600" /> {m}</label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="form-label">Status Biaya</legend>
                    <div className="mt-1 space-y-2" onChange={(e) => {
                      const paid = (e.target as HTMLInputElement).value === "Berbayar";
                      setBerbayar(paid);
                      if (!paid) setBiaya("");
                    }}>
                      <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name="status_biaya" value="Berbayar" defaultChecked={values.status_biaya === "Berbayar"} className="text-indigo-600" /> Berbayar (Wajib ke FAT)</label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name="status_biaya" value="Tanpa Biaya" defaultChecked={values.status_biaya === "Tanpa Biaya"} className="text-indigo-600" /> Tanpa Biaya (Tidak Wajib ke FAT)</label>
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="form-label">Skala Aplikasi</legend>
                    <div className="mt-1 space-y-2">
                      {[["Kecil/Nemo Tetra", "Kecil / Nemo Tetra"], ["Menengah/Salmon", "Menengah / Salmon"], ["Besar/Whale", "Besar / Whale"]].map(([value, label]) => (
                        <label key={value} className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name="skala_aplikasi" value={value} defaultChecked={values.skala_aplikasi === value} className="text-indigo-600" /> {label}</label>
                      ))}
                    </div>
                  </fieldset>
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="estimasi_durasi" className="form-label">Estimasi Durasi (Hari Kalender)</label>
                    <input type="number" id="estimasi_durasi" name="estimasi_durasi" defaultValue={values.estimasi_durasi} min={1} placeholder="30" className="form-input" />
                  </div>
                  <div>
                    <label htmlFor="estimasi_biaya" className="form-label">Estimasi Biaya</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-sm font-medium text-gray-400">Rp</span>
                      <input id="estimasi_biaya" name="estimasi_biaya" value={biaya} onChange={(e) => setBiaya(e.target.value)} disabled={!berbayar} placeholder="0" className="form-input pl-9" />
                    </div>
                  </div>
                </div>
                <div>
                  <div className="form-label">Catatan Teknis</div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {[["server", "Server", Server, "Kebutuhan server..."], ["lisensi", "Lisensi", Key, "Kebutuhan lisensi..."], ["integrasi", "Integrasi Data", Exchange, "Integrasi sistem lain..."], ["hardware", "Hardware", Desktop, "Kebutuhan hardware..."]].map(([key, label, Icon, placeholder]) => {
                      const IconComponent = Icon as typeof Server;
                      const name = `catatan_${key as string}` as keyof FpaValues;
                      return (
                        <div key={key as string}>
                          <label htmlFor={name} className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-500"><IconComponent className="h-3 w-3 text-gray-400" />{label as string}</label>
                          <textarea id={name} name={name} defaultValue={values[name] as string} rows={2} placeholder={placeholder as string} className="form-textarea" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
            <FormButtons pending={pending} tone="indigo" label={context.revision ? "Kirim Ulang Revisi" : "Kirim Pengajuan FPA"} />
          </>
        )}
      </ActionForm>
    </div>
  );
}
