import { AlertTriangle, Check, CheckCircle2 } from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import type { ChecklistItem } from "@/lib/checklist";
import type { DocType } from "@/lib/documents";
import { formatDate } from "@/lib/dates";
import type { ScopeItem } from "@/lib/scope";
import ActionForm, { SubmitButton } from "./ActionForm";
import { ChecklistDeadlineBadge } from "./ui";
import { checklistAction } from "@/app/(app)/approvals/actions";

// Solusi / Fitur-Scope list of an approved document, with Dev and requester test checkboxes.
export function ChecklistPanel({ items, type, createdBy, user }: { items: ChecklistItem[]; type: DocType; createdBy: number | null; user: CurrentUser }) {
  if (items.length === 0) return <p className="text-sm text-gray-500">Belum ada item.</p>;
  const isRequester = Number(createdBy ?? 0) === user.id;
  const isAdmin = user.role === "Admin";
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const devDone = item.dev_done_by !== null;
        const completed = item.user_tested_at !== null;
        const canReview = isRequester && devDone && !completed;
        return (
          <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1 break-words text-sm text-gray-800">
                <div className={`whitespace-pre-line ${item.item_detail ? "font-semibold" : ""}`}>{item.item_index}. {item.item_text}</div>
                {item.item_detail && <div className="mt-1 whitespace-pre-line pl-5 text-xs text-gray-600">{item.item_detail}</div>}
              </div>
              <ActionForm action={checklistAction} messagePosition="none" className="flex shrink-0 items-center gap-1.5 text-xs">
                <input type="hidden" name="type" value={type} />
                <input type="hidden" name="item_id" value={item.id} />
                <input type="hidden" name="field" value="dev" />
                <SubmitButton disabled={!isAdmin} title={isAdmin ? (devDone ? "Batalkan tanda selesai" : "Tandai selesai dikerjakan") : "Hanya Admin yang dapat mengubah ini"}
                  aria-label={`Dev selesai: ${item.item_text}`} aria-pressed={devDone}
                  className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${devDone ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-300 text-transparent"} ${isAdmin ? "cursor-pointer hover:border-indigo-400" : "cursor-not-allowed opacity-40"}`}>
                  <Check className="h-3 w-3" aria-hidden="true" />
                </SubmitButton>
                <span className="whitespace-nowrap text-gray-500">Dev{devDone && item.dev_done_by_name ? ` · ${item.dev_done_by_name}` : ""}</span>
              </ActionForm>
            </div>

            {item.rejected_note && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <div><span className="font-semibold">{item.rejected_by_name ?? "Pemohon"}</span> menandai belum sesuai ({formatDate(item.rejected_at, "d M Y")}): {item.rejected_note}</div>
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {!devDone ? (
                <span className="text-xs text-gray-400">Menunggu Developer menyelesaikan item ini</span>
              ) : completed ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Selesai &middot; {item.user_tested_by ? `ditest ${item.user_tested_by_name}` : "otomatis setelah 7 hari tanpa respons"}
                </span>
              ) : (
                <>
                  {item.dev_done_at && <ChecklistDeadlineBadge devDoneAt={item.dev_done_at} />}
                  {canReview ? (
                    <>
                      <ActionForm action={checklistAction} messagePosition="none" className="inline">
                        <input type="hidden" name="type" value={type} />
                        <input type="hidden" name="item_id" value={item.id} />
                        <input type="hidden" name="field" value="user_ok" />
                        <SubmitButton className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60">
                          <Check className="h-3 w-3" aria-hidden="true" /> Oke
                        </SubmitButton>
                      </ActionForm>
                      <details className="text-xs">
                        <summary className="cursor-pointer select-none px-1 py-1.5 text-amber-700 hover:text-amber-900">Belum Sesuai</summary>
                        <ActionForm action={checklistAction} messagePosition="bottom" className="mt-2 flex max-w-sm flex-col gap-2">
                          <input type="hidden" name="type" value={type} />
                          <input type="hidden" name="item_id" value={item.id} />
                          <input type="hidden" name="field" value="user_reject" />
                          <textarea name="note" rows={2} maxLength={1000} required aria-label="Catatan yang belum sesuai" placeholder="Jelaskan apa yang belum sesuai..." className="w-full rounded-md border border-gray-300 p-2 text-xs" />
                          <SubmitButton className="self-start rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60">Kirim Revisi</SubmitButton>
                        </ActionForm>
                      </details>
                    </>
                  ) : (
                    <span className="text-xs text-gray-400">Menunggu konfirmasi pemohon</span>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Numbered list of items for documents that have no checklist yet.
export function ScopeItemList({ items }: { items: ScopeItem[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-gray-700">
      {items.map((item, index) => (
        <li key={index} className="break-words">
          <div className={`whitespace-pre-line ${item.keterangan ? "font-semibold" : ""}`}>{item.nama}</div>
          {item.keterangan && <div className="mt-0.5 whitespace-pre-line text-sm text-gray-600">{item.keterangan}</div>}
        </li>
      ))}
    </ol>
  );
}
