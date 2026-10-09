"use client";

import { useState } from "react";
import { Bug, CheckCircle2, Database, Gauge, Headset, Info, MoreHorizontal, Wrench } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { submitFpmAction } from "../actions";
import { FormButtons, FormHeader, RequesterCard, SectionHeader, type FormContext } from "../FormParts";

const KENDALA = [
  { value: "Bug/Error", label: "Bug / Error", icon: Bug, color: "text-red-500" },
  { value: "Performa Lambat", label: "Performa Lambat", icon: Gauge, color: "text-yellow-500" },
  { value: "Perubahan Data", label: "Perubahan Data", icon: Database, color: "text-blue-500" },
];

const card = "cursor-pointer rounded-xl border-2 border-gray-200 p-4 text-center transition focus-within:ring-2 focus-within:ring-emerald-300 has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50";

export default function FpmForm({ user, today, sistemOptions }: { user: FormContext["user"]; today: string; sistemOptions: string[] }) {
  const [lainnya, setLainnya] = useState(false);
  const [sent, setSent] = useState(false);
  // Remounting the form clears it after a report is sent.
  const [formKey, setFormKey] = useState(0);

  return (
    <div className="mx-auto max-w-3xl py-8">
      <FormHeader icon={<Wrench className="h-6 w-6" />} tone="emerald" title="Form Permintaan Maintenance"
        subtitle="FPM — Laporkan bug, gangguan performa, atau permintaan perbaikan sistem" badge={<><Headset className="h-4 w-4 opacity-50" aria-hidden="true" /> IT Support</>} />
      {sent && (
        <div role="status" className="mb-6 flex items-center gap-4 rounded-xl border border-green-200 bg-green-50 p-5 text-green-800">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100"><CheckCircle2 className="h-5 w-5 text-green-500" aria-hidden="true" /></div>
          <div>
            <div className="mb-0.5 font-bold">Laporan Berhasil Dikirim!</div>
            <div className="text-sm">Permintaan maintenance berhasil dilaporkan! Tim IT akan segera menindaklanjuti.</div>
          </div>
        </div>
      )}
      <ActionForm key={formKey} action={submitFpmAction} onSuccess={() => { setSent(true); setLainnya(false); setFormKey((k) => k + 1); }}>
        {(pending) => (
          <>
            <section className="form-section">
              <SectionHeader letter="A" tone="bg-emerald-100 text-emerald-700" title="Data Pelaporan" subtitle="Informasi dasar laporan maintenance" />
              <div className="form-section-body grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label htmlFor="nama_sistem" className="form-label">Nama Sistem / Aplikasi <span className="text-red-500">*</span></label>
                  <input id="nama_sistem" name="nama_sistem" required maxLength={200} list="sistem-options" placeholder="Ketik atau pilih nama sistem/aplikasi..." className="form-input" />
                  <datalist id="sistem-options">{sistemOptions.map((option) => <option key={option} value={option} />)}</datalist>
                </div>
                <RequesterCard user={user} tone="emerald" label="Pelapor" />
                <div>
                  <label htmlFor="tanggal_kejadian" className="form-label">Tanggal Kejadian <span className="text-red-500">*</span></label>
                  <input type="date" id="tanggal_kejadian" name="tanggal_kejadian" defaultValue={today} required className="form-input" />
                </div>
              </div>
            </section>
            <section className="form-section">
              <SectionHeader letter="B" tone="bg-red-100 text-red-700" title="Detail Kendala" subtitle="Jelaskan masalah yang dialami" />
              <div className="form-section-body space-y-5">
                <fieldset>
                  <legend className="form-label">Jenis Kendala <span className="text-red-500">*</span></legend>
                  <div className="mt-1 grid grid-cols-2 gap-3 md:grid-cols-4">
                    {KENDALA.map(({ value, label, icon: Icon, color }) => (
                      <label key={value} className={card}>
                        <input type="checkbox" name="jenis_kendala[]" value={value} className="sr-only" />
                        <Icon className={`mx-auto mb-2 h-6 w-6 ${color}`} aria-hidden="true" />
                        <span className="text-sm font-semibold text-gray-700">{label}</span>
                      </label>
                    ))}
                    <label className={card}>
                      <input type="checkbox" name="jenis_kendala_lainnya" value="1" checked={lainnya} onChange={(e) => setLainnya(e.target.checked)} className="sr-only" />
                      <MoreHorizontal className="mx-auto mb-2 h-6 w-6 text-gray-400" aria-hidden="true" />
                      <span className="text-sm font-semibold text-gray-700">Lainnya</span>
                    </label>
                  </div>
                  {lainnya && <input name="kendala_lainnya" required maxLength={150} aria-label="Jenis kendala lainnya" placeholder="Sebutkan jenis kendala lain..." className="form-input mt-3" />}
                </fieldset>
                <div>
                  <label htmlFor="deskripsi_kendala" className="form-label">Deskripsi Kendala <span className="text-red-500">*</span></label>
                  <textarea id="deskripsi_kendala" name="deskripsi_kendala" required rows={5} placeholder="Jelaskan masalah secara detail: apa yang terjadi, kapan terjadi, langkah-langkah yang sudah dicoba, dan dampaknya..." className="form-textarea" />
                  <p className="mt-1 flex items-center gap-1 text-xs text-gray-400"><Info className="h-3 w-3" aria-hidden="true" />Sertakan langkah-langkah reproduksi atau screenshot jika ada (dapat dilampirkan ke email IT)</p>
                </div>
              </div>
            </section>
            <FormButtons pending={pending} tone="emerald" label="Kirim Laporan Maintenance" />
          </>
        )}
      </ActionForm>
    </div>
  );
}
