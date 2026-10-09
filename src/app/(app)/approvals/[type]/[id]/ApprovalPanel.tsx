import Link from "next/link";
import type { CurrentUser } from "@/lib/auth";
import { approvalLabel, canActApproval, type ApprovalRun, type ApprovalStep } from "@/lib/approval";
import type { Row } from "@/lib/db";
import { revisionUrl, type DocType } from "@/lib/documents";
import { decodeScopeItems, scopeItemsAsText } from "@/lib/scope";
import ActionForm, { SubmitButton } from "@/components/ActionForm";
import { activateApprovalAction, decisionAction } from "../../actions";

const STEP_LABELS: Record<ApprovalStep["state"], string> = {
  waiting: "Menunggu giliran",
  approved: "Disetujui",
  rejected: "Ditolak",
  revision: "Meminta revisi",
  skipped: "Tidak dilanjutkan",
};

const ACTION_LABELS: Record<string, string> = {
  submit: "Pengajuan masuk",
  resubmit: "Revisi dikirim ulang",
  approve: "Menyetujui",
  reject: "Menolak",
  revision: "Meminta revisi",
  adjust_duration: "Mengoreksi estimasi hari",
};

function titleCase(field: string): string {
  return field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function SnapshotFields({ snapshot }: { snapshot: string }) {
  let fields: Record<string, unknown> = {};
  try {
    fields = JSON.parse(snapshot) ?? {};
  } catch {
    return null;
  }
  return (
    <dl className="mt-2 space-y-2 rounded-lg bg-gray-50 p-3">
      {Object.entries(fields).map(([field, raw]) => {
        if (raw === null || raw === "" || field === "id" || field === "created_by_user_id") return null;
        let value = String(raw);
        if (field === "deskripsi_perubahan" || field === "solusi") {
          const items = decodeScopeItems(value, field === "solusi" ? "fpa_solusi_list" : "fpaa_scope_list");
          if (items) value = scopeItemsAsText(items);
        }
        return (
          <div key={field}>
            <dt className="text-xs text-gray-500">{titleCase(field)}</dt>
            <dd className="whitespace-pre-line break-words">{value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export default function ApprovalPanel({ type, document, run, steps, events, user }: {
  type: DocType;
  document: Row;
  run: ApprovalRun | null;
  steps: ApprovalStep[];
  events: Row[];
  user: CurrentUser;
}) {
  return (
    <section className="mb-6 space-y-4 rounded-xl border border-indigo-100 bg-white p-5">
      <h2 className="text-lg font-bold text-gray-900">{approvalLabel(run, steps, document.status_dokumen)}</h2>
      {run ? (
        <>
          <p className="text-sm text-gray-500">Putaran {run.cycle} · Persetujuan dilakukan sesuai urutan berikut.</p>
          <ol className="space-y-2">
            {steps.map((step) => {
              const active = run.state === "pending" && step.position === run.current_position;
              return (
                <li key={step.position} className={`rounded-lg border p-3 ${active ? "border-indigo-300 bg-indigo-50" : "border-gray-200"}`}>
                  <div className="text-sm font-semibold">{step.position}. {step.approver_name} — {active ? "Menunggu persetujuan" : STEP_LABELS[step.state]}</div>
                  {step.acted_at && <div className="mt-1 text-xs text-gray-500">{step.acted_at}</div>}
                  {step.note && <p className="mt-1 whitespace-pre-line text-sm">{step.note}</p>}
                </li>
              );
            })}
          </ol>

          {canActApproval(run, steps, user) ? (
            <ActionForm action={decisionAction} className="space-y-3">
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="id" value={document.id} />
              <input type="hidden" name="cycle" value={run.cycle} />
              <input type="hidden" name="position" value={run.current_position} />
              <label htmlFor="approval-note" className="block text-sm font-medium">Catatan keputusan</label>
              <textarea id="approval-note" name="note" maxLength={5000} rows={3} className="w-full rounded-lg border p-3" placeholder="Wajib diisi jika menolak atau meminta revisi." />
              <div className="flex flex-wrap gap-3">
                <SubmitButton name="action" value="approve" className="rounded-lg bg-indigo-600 px-5 py-2.5 text-white disabled:opacity-60">
                  Setujui {run.current_position === steps.length ? "Final" : "& Teruskan"}
                </SubmitButton>
                <SubmitButton name="action" value="revision" className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-2.5 text-amber-900 disabled:opacity-60">Minta Revisi</SubmitButton>
                <SubmitButton name="action" value="reject" className="rounded-lg border border-red-200 bg-red-50 px-5 py-2.5 text-red-700 disabled:opacity-60">Tolak</SubmitButton>
              </div>
            </ActionForm>
          ) : run.state === "revision" && run.requester_id === user.id ? (
            <Link href={revisionUrl(type, Number(document.id))} className="inline-block rounded-lg bg-amber-500 px-5 py-2.5 font-semibold text-gray-900">Perbaiki &amp; Kirim Ulang</Link>
          ) : null}

          {run.project_id && <Link href={`/projects/${run.project_id}`} className="inline-block text-indigo-700 underline">Lihat project</Link>}

          <details className="border-t pt-4">
            <summary className="cursor-pointer font-semibold text-gray-800">Riwayat pengajuan &amp; keputusan ({events.length})</summary>
            <ol className="mt-3 space-y-3">
              {events.map((event) => (
                <li key={event.id} className="border-l-2 border-indigo-200 pl-3 text-sm">
                  <p className="font-medium">{event.actor_name} · {ACTION_LABELS[event.action] ?? event.action}</p>
                  <p className="text-xs text-gray-500">Putaran {event.cycle} · {event.created_at}</p>
                  {event.note && <p className="mt-1 whitespace-pre-line">{event.note}</p>}
                  {event.document_snapshot && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-indigo-700">Lihat isi dokumen saat dikirim</summary>
                      <SnapshotFields snapshot={event.document_snapshot} />
                    </details>
                  )}
                </li>
              ))}
            </ol>
          </details>
        </>
      ) : ["Draft", "Diajukan", "Diverifikasi"].includes(document.status_dokumen) ? (
        <>
          <p className="text-sm text-gray-600">Pengajuan lama ini belum memiliki jalur approval.</p>
          {user.role === "Admin" && document.created_by_user_id ? (
            <>
              <p className="text-sm text-gray-600">Aktifkan untuk memakai jalur pemohon yang tersimpan di menu Users.</p>
              <ActionForm action={activateApprovalAction}>
                <input type="hidden" name="type" value={type} />
                <input type="hidden" name="id" value={document.id} />
                <SubmitButton className="rounded-lg bg-indigo-600 px-4 py-2 text-white disabled:opacity-60">Aktifkan Jalur Approval</SubmitButton>
              </ActionForm>
            </>
          ) : (
            <p className="text-sm text-gray-600">
              {document.created_by_user_id ? "Hubungi Admin untuk mengaktifkan jalurnya." : "Akun pemohon belum tercatat pada dokumen lama ini. Admin perlu memverifikasi pemiliknya sebelum jalur dapat diaktifkan."}
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
