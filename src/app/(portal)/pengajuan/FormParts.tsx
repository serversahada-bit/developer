"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Hash, Plus, Send, Trash2, X } from "lucide-react";
import type { ScopeItem } from "@/lib/scope";

export interface FormRouteStep {
  approver_name: string;
  state?: string;
  note?: string | null;
}

export interface FormContext {
  user: { full_name: string; role: string; username: string; division: string | null };
  route: FormRouteStep[];
  revision: { cycle: number } | null;
}

export function FormHeader({ icon, tone, title, subtitle, badge }: { icon: ReactNode; tone: "indigo" | "purple" | "emerald"; title: string; subtitle: string; badge: ReactNode }) {
  const color = { indigo: "bg-indigo-600 shadow-indigo-200", purple: "bg-purple-600 shadow-purple-200", emerald: "bg-emerald-600 shadow-emerald-200" }[tone];
  const badgeColor = { indigo: "bg-indigo-50 text-indigo-700 border-indigo-200", purple: "bg-purple-50 text-purple-700 border-purple-200", emerald: "bg-emerald-50 text-emerald-700 border-emerald-200" }[tone];
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:flex-row md:items-center">
      <div className="flex items-center gap-4">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg ${color}`}>{icon}</div>
        <div>
          <h1 className="mb-1 text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
      </div>
      <div className={`flex items-center gap-2 whitespace-nowrap rounded-xl border px-4 py-2.5 text-sm font-bold ${badgeColor}`}>{badge}</div>
    </div>
  );
}

export function NumberBadge({ value }: { value: string }) {
  return <><Hash className="h-4 w-4 opacity-50" aria-hidden="true" /> {value}</>;
}

// Division / revision / approval route notices shown above the FPA and FPA-A forms.
export function ApprovalNotice({ context }: { context: FormContext }) {
  return (
    <>
      {!context.user.division && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <strong>Divisi belum diatur</strong>
          <p className="mt-1">Divisi akun Anda belum diatur. Hubungi Admin untuk mengaturnya melalui menu Users sebelum mengirim pengajuan.</p>
        </div>
      )}
      {context.revision && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Revisi pengajuan · Putaran {context.revision.cycle}</strong>
          <p className="mt-1">Perbaiki isian di bawah, lalu kirim kembali. Persetujuan dimulai dari tahap pertama.</p>
          {context.route.filter((step) => step.state === "revision").map((step, i) => (
            <p key={i} className="mt-2 whitespace-pre-line">{step.approver_name}: {step.note}</p>
          ))}
        </div>
      )}
      <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
        <strong>Jalur approval</strong>
        <p className="mt-1">
          {context.route.length
            ? context.route.map((step) => step.approver_name).join(" → ")
            : "Jalur approval belum diatur. Hubungi Admin untuk mengaturnya melalui menu Users sebelum mengirim pengajuan."}
        </p>
      </div>
    </>
  );
}

export function RequesterCard({ user, tone, label }: { user: FormContext["user"]; tone: "indigo" | "purple" | "emerald"; label: string }) {
  const style = { indigo: ["border-indigo-100 bg-indigo-50", "text-indigo-900", "text-indigo-700"], purple: ["border-purple-100 bg-purple-50", "text-purple-900", "text-purple-700"], emerald: ["border-emerald-100 bg-emerald-50", "text-emerald-900", "text-emerald-700"] }[tone];
  return (
    <div>
      <div className="form-label">{label}</div>
      <div className={`rounded-lg border px-4 py-3 ${style[0]}`}>
        <div className={`font-semibold ${style[1]}`}>{user.full_name}</div>
        <div className={`mt-1 text-xs ${style[2]}`}>{user.role} &middot; @{user.username}</div>
        <p className="mt-2 text-xs text-gray-500">Otomatis menggunakan akun yang sedang login.</p>
      </div>
    </div>
  );
}

export function DivisionField({ division }: { division: string | null }) {
  return (
    <div>
      <label htmlFor="departemen" className="form-label">Departemen <span className="text-red-500">*</span></label>
      <input id="departemen" type="text" value={division || "Belum diatur, hubungi Admin"} readOnly className="form-input" />
      <p className="mt-1 text-xs text-gray-500">Mengikuti Divisi akun Anda.</p>
    </div>
  );
}

// Stable React keys for rows added and removed on the client.
let rowKeySeq = 0;
const withKey = (item: ScopeItem) => ({ ...item, key: rowKeySeq++ });

// Feature / scope rows: name + explanation, 1 to 50 rows. Field names match the server parser.
export function ScopeItemsField({ field, initial, itemLabel, legend, help, namePlaceholder, detailPlaceholder, tone }: {
  field: string;
  initial: ScopeItem[];
  itemLabel: string;
  legend: string;
  help: string;
  namePlaceholder: string;
  detailPlaceholder: string;
  tone: "indigo" | "purple";
}) {
  const [rows, setRows] = useState(() => (initial.length ? initial : [{ nama: "", keterangan: "" }]).map(withKey));
  const addStyle = tone === "purple" ? "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100" : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100";

  return (
    <fieldset aria-describedby={`${field}-help`}>
      <legend className="form-label">{legend} <span className="text-red-500">*</span></legend>
      <p id={`${field}-help`} className="mb-4 text-sm text-gray-500">{help}</p>
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={row.key} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-gray-700">{itemLabel} {index + 1}</span>
              <button type="button" disabled={rows.length === 1} aria-label={`Hapus ${itemLabel.toLowerCase()} ${index + 1}`}
                onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Hapus
              </button>
            </div>
            <label htmlFor={`${field}-nama-${index}`} className="mb-1 block text-xs font-semibold text-gray-600">Nama Fitur <span className="text-red-500">*</span></label>
            <input id={`${field}-nama-${index}`} name={`${field}[${index}][nama]`} required maxLength={200} defaultValue={row.nama} placeholder={namePlaceholder} className="form-input mb-3" />
            <label htmlFor={`${field}-keterangan-${index}`} className="mb-1 block text-xs font-semibold text-gray-600">Keterangan Fitur / Rumus <span className="text-red-500">*</span></label>
            <textarea id={`${field}-keterangan-${index}`} name={`${field}[${index}][keterangan]`} required maxLength={1000} rows={2} defaultValue={row.keterangan} placeholder={detailPlaceholder} className="form-textarea" />
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" disabled={rows.length >= 50} onClick={() => setRows((current) => [...current, withKey({ nama: "", keterangan: "" })])}
          className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${addStyle}`}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Tambah {itemLabel}
        </button>
        <span role="status" aria-live="polite" className="text-xs text-gray-500">{rows.length} item</span>
      </div>
    </fieldset>
  );
}

export function FormButtons({ pending, label, tone }: { pending: boolean; label: string; tone: "indigo" | "purple" | "emerald" }) {
  const color = { indigo: "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200", purple: "bg-purple-600 hover:bg-purple-700 shadow-purple-200", emerald: "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200" }[tone];
  return (
    <div className="flex justify-end gap-3">
      <Link href="/pengajuan" className="flex items-center gap-2 rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50">
        <X className="h-4 w-4" aria-hidden="true" /> Batal
      </Link>
      <button type="submit" disabled={pending} className={`flex items-center gap-2 rounded-lg px-8 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:-translate-y-0.5 disabled:opacity-60 ${color}`}>
        <Send className="h-4 w-4" aria-hidden="true" /> {pending ? "Mengirim..." : label}
      </button>
    </div>
  );
}

export function SectionHeader({ letter, tone, title, subtitle }: { letter: string; tone: string; title: string; subtitle: ReactNode }) {
  return (
    <div className="form-section-header">
      <div className={`section-badge ${tone}`}>{letter}</div>
      <div>
        <h2 className="font-bold text-gray-800">{title}</h2>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
    </div>
  );
}
