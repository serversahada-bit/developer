import Link from "next/link";
import type { CurrentUser } from "@/lib/auth";
import { approvalLabel, canActApproval, canAdjustBudget, canRejectFinal, type ApprovalRun, type ApprovalStep } from "@/lib/approval";
import type { Row } from "@/lib/db";
import { costColumns, effectiveCost, revisionUrl, rupiah, STAGE_LABEL, type DocType } from "@/lib/documents";
import { decodeScopeItems, scopeItemsAsText } from "@/lib/scope";
import ActionForm, { SubmitButton } from "@/components/ActionForm";
import { activateApprovalAction, budgetAction, decisionAction } from "../../actions";

const STEP_LABELS: Record<ApprovalStep["state"], string> = {
  waiting: "Menunggu giliran",
  approved: "Disetujui",
  rejected: "Ditolak",
  revision: "Dikembalikan untuk revisi",
  skipped: "Tidak dilanjutkan",
};

const ACTION_LABELS: Record<string, string> = {
  submit: "Pengajuan masuk",
  resubmit: "Revisi dikirim ulang",
  approve: "Menyetujui",
  approve_final: "Menyetujui final",
  reject: "Menolak",
  revision: "Mengembalikan untuk revisi",
  adjust_duration: "Mengoreksi estimasi hari",
  adjust_budget: "Mengubah budget",
  reassign: "Mengalihkan approver",
};

function titleCase(field: string): string {
  return field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// "Manager IT · Name"; a stage without a person yet (Tim IT, a skipped atasan) shows its label only.
function stepTitle(step: ApprovalStep): string {
  if (!step.stage) return step.approver_name;
  const label = STAGE_LABEL[step.stage];
  return step.approver_name === label ? label : `${label} · ${step.approver_name}`;
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

function BudgetForm({ type, document }: { type: DocType; document: Row }) {
  const { original, corrected } = costColumns(type);
  const requested = type === "fpa" && document.status_biaya !== "Berbayar" ? 0 : Number(document[original] ?? 0);
  return (
    <ActionForm action={budgetAction} messagePosition="bottom" className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="id" value={document.id} />
      <div>
        <h3 className="font-semibold text-gray-900">Ubah budget</h3>
        <p className="mt-1 text-xs text-gray-600">
          Diajukan pemohon: {requested > 0 ? rupiah(requested) : "tanpa biaya"} · Berlaku sekarang: {effectiveCost(type, document) > 0 ? rupiah(effectiveCost(type, document)) : "tanpa biaya"}.
          Manager FAT hanya ikut menyetujui jika budget akhir lebih dari Rp 0. Kosongkan untuk kembali ke nilai pemohon.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[12rem_1fr]">
        <div>
          <label htmlFor="budget-value" className="mb-1 block text-xs font-medium text-gray-500">Budget baru (Rp)</label>
          <input id="budget-value" name="budget" inputMode="decimal" defaultValue={document[corrected] !== null ? Number(document[corrected]).toLocaleString("id-ID") : ""} placeholder="Contoh: 3.500.000" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="budget-reason" className="mb-1 block text-xs font-medium text-gray-500">Alasan perubahan (wajib)</label>
          <input id="budget-reason" name="reason" required maxLength={1000} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
      </div>
      <SubmitButton className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">Simpan Budget</SubmitButton>
    </ActionForm>
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
              const skipped = step.state === "skipped" && step.stage !== null && step.note !== null;
              return (
                <li key={step.position} className={`rounded-lg border p-3 ${active ? "border-indigo-300 bg-indigo-50" : skipped ? "border-dashed border-gray-200 text-gray-500" : "border-gray-200"}`}>
                  <div className="text-sm font-semibold">{step.position}. {stepTitle(step)} — {active ? "Menunggu persetujuan" : skipped ? "Dilewati" : STEP_LABELS[step.state]}</div>
                  {step.acted_at && <div className="mt-1 text-xs text-gray-500">{step.acted_at}</div>}
                  {step.note && <p className="mt-1 whitespace-pre-line text-sm">{step.note}</p>}
                </li>
              );
            })}
          </ol>

          {canAdjustBudget(run, steps, user) && <BudgetForm type={type} document={document} />}

          {canActApproval(run, steps, user) ? (
            <ActionForm action={decisionAction} className="space-y-3">
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="id" value={document.id} />
              <input type="hidden" name="cycle" value={run.cycle} />
              <input type="hidden" name="position" value={run.current_position} />
              <label htmlFor="approval-note" className="block text-sm font-medium">Catatan keputusan</label>
              <textarea id="approval-note" name="note" maxLength={5000} rows={3} className="w-full rounded-lg border p-3" placeholder="Wajib diisi jika mengembalikan untuk revisi atau menolak." />
              <div className="flex flex-wrap gap-3">
                <SubmitButton name="action" value="approve" className="rounded-lg bg-indigo-600 px-5 py-2.5 text-white disabled:opacity-60">Setujui</SubmitButton>
                <SubmitButton name="action" value="revision" className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-2.5 text-amber-900 disabled:opacity-60">Kembalikan untuk Revisi</SubmitButton>
                {canRejectFinal(run, steps) && (
                  <SubmitButton name="action" value="reject" className="rounded-lg border border-red-200 bg-red-50 px-5 py-2.5 text-red-700 disabled:opacity-60">Tolak Final</SubmitButton>
                )}
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
              <p className="text-sm text-gray-600">Aktifkan untuk memakai urutan approval standar: Atasan langsung → Tim IT → Manager IT → Manager FAT (jika ada biaya).</p>
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
