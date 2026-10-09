"use client";

import { useEffect, useRef, useState } from "react";
import { AlignLeft, CalendarDays, Check, Flag, Folder, Layers, ListChecks, Pencil, Plus, Trash2, X } from "lucide-react";
import ActionForm from "./ActionForm";
import { deleteLogAction, saveLogAction } from "@/app/(app)/log-actions";

export interface EditableLog {
  id: number;
  log_date: string;
  deadline: string | null;
  project_name: string | null;
  task_name: string;
  description: string | null;
  status: string;
}

const OPEN_EVENT = "log-modal:open";

// Opens the shared modal: with a log to edit it, without one to create a new task.
export function openLogModal(log?: EditableLog) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: log ?? null }));
}

export function AddLogButton({ label = "Add Log", className }: { label?: string; className?: string }) {
  return (
    <button type="button" onClick={() => openLogModal()} className={className ?? "flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"}>
      <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {label}
    </button>
  );
}

export function EditLogButton({ log, className }: { log: EditableLog; className?: string }) {
  return (
    <button type="button" onClick={() => openLogModal(log)} title="Edit task" aria-label={`Edit ${log.task_name}`}
      className={className ?? "flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:border-indigo-300 hover:text-indigo-600"}>
      <Pencil className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}

export function DeleteLogButton({ id, label = "Hapus log aktivitas ini?", className }: { id: number; label?: string; className?: string }) {
  return (
    <ActionForm action={deleteLogAction} confirm={label} messagePosition="none" className="inline">
      <input type="hidden" name="id" value={id} />
      <button type="submit" title="Hapus task" aria-label="Hapus task"
        className={className ?? "flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:border-red-300 hover:text-red-600"}>
        <Trash2 className="h-3 w-3" aria-hidden="true" />
      </button>
    </ActionForm>
  );
}

const fieldClass = "w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function LogModal({ projects, today }: { projects: string[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<EditableLog | null>(null);
  const [formKey, setFormKey] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      setLog((event as CustomEvent<EditableLog | null>).detail);
      setFormKey((key) => key + 1);
      setOpen(true);
      setTimeout(() => nameRef.current?.focus(), 50);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener(OPEN_EVENT, handler);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, handler);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!open) return null;
  const editing = log !== null;
  // A project renamed or deleted since the log was written stays selectable for this log.
  const options = log?.project_name && !projects.includes(log.project_name) ? [log.project_name, ...projects] : projects;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-labelledby="log-modal-title" className="w-full max-w-2xl overflow-hidden rounded-xl border border-gray-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 bg-[#fafafa] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Layers className="h-4 w-4" aria-hidden="true" /></span>
            <h2 id="log-modal-title" className="text-lg font-bold tracking-tight text-gray-900">{editing ? "Edit Task Details" : "Create New Task"}</h2>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Tutup" className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200">
            <X className="h-4 w-4" />
          </button>
        </div>
        <ActionForm key={formKey} action={saveLogAction} onSuccess={() => setOpen(false)} className="p-6">
          {(pending) => (
            <>
              <input type="hidden" name="id" value={log?.id ?? ""} />
              <div className="space-y-6">
                <div>
                  <label htmlFor="task_name" className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-700">Task Name</label>
                  <input ref={nameRef} id="task_name" name="task_name" required maxLength={255} defaultValue={log?.task_name ?? ""} placeholder="e.g. Server Maintenance"
                    className="w-full border-0 border-b-2 border-gray-200 bg-transparent px-0 py-2 text-lg font-medium text-gray-900 placeholder-gray-300 focus:border-indigo-600 focus:outline-none focus:ring-0" />
                </div>
                <div>
                  <label htmlFor="project_name" className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-gray-700"><Folder className="h-3 w-3" aria-hidden="true" /> Project</label>
                  <select id="project_name" name="project_name" defaultValue={log?.project_name ?? ""} className={fieldClass}>
                    <option value="">-- Pilih Project (Opsional) --</option>
                    {options.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <div>
                    <label htmlFor="log_date" className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-gray-700"><CalendarDays className="h-3 w-3" aria-hidden="true" /> Date</label>
                    <input type="date" id="log_date" name="log_date" required defaultValue={log?.log_date ?? today} className={fieldClass} />
                  </div>
                  <div>
                    <label htmlFor="deadline" className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-gray-700"><Flag className="h-3 w-3" aria-hidden="true" /> Deadline</label>
                    <input type="date" id="deadline" name="deadline" defaultValue={log?.deadline ?? ""} className={fieldClass} />
                  </div>
                  <div>
                    <label htmlFor="status" className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-gray-700"><ListChecks className="h-3 w-3" aria-hidden="true" /> Phase (Status)</label>
                    <select id="status" name="status" defaultValue={log?.status === "Belum" ? "Belum Selesai" : log?.status ?? "Dalam Proses"} className={`${fieldClass} bg-white`}>
                      <option value="Belum Selesai">Discovery &amp; Structure (Belum Selesai)</option>
                      <option value="Dalam Proses">Core Features (Dalam Proses)</option>
                      <option value="Selesai">Polish &amp; Delivery (Selesai)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="description" className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-gray-700"><AlignLeft className="h-3 w-3" aria-hidden="true" /> Description</label>
                  <textarea id="description" name="description" defaultValue={log?.description ?? ""} placeholder="Add more details to this task..." className={`${fieldClass} min-h-[120px] resize-y py-3`} />
                </div>
              </div>
              <div className="mt-8 flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={pending} className="flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60">
                  {editing ? <Check className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                  {editing ? "Update Task" : "Create Task"}
                </button>
              </div>
            </>
          )}
        </ActionForm>
      </div>
    </div>
  );
}
