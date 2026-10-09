"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { createProjectAction } from "../log-actions";

const inputClass = "w-full rounded-md border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500";

export default function ProjectModal({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700">
        <Plus className="h-4 w-4" aria-hidden="true" /> New Project
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="project-modal-title" className="mx-4 w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4">
              <h2 id="project-modal-title" className="text-lg font-bold text-gray-800">Create New Project</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Tutup" className="rounded-md p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"><X className="h-4 w-4" /></button>
            </div>
            <ActionForm action={createProjectAction} onSuccess={() => setOpen(false)} className="p-6">
              {(pending) => (
                <>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="project-name" className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-700">Project Name <span className="text-red-500">*</span></label>
                      <input id="project-name" name="name" required maxLength={200} placeholder="e.g. Aplikasi Absensi" className={inputClass} />
                    </div>
                    <div>
                      <label htmlFor="project-description" className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-700">Description</label>
                      <textarea id="project-description" name="description" placeholder="Deskripsi singkat tentang project ini..." className={`${inputClass} min-h-[60px]`} />
                    </div>
                    <fieldset>
                      <legend className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-700">Category</legend>
                      <div className="flex gap-4">
                        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700"><input type="radio" name="category" value="Non-FPA" defaultChecked className="text-indigo-600" /> Non-FPA (Routine)</label>
                        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700"><input type="radio" name="category" value="FPA" className="text-indigo-600" /> With FPA (Formal)</label>
                      </div>
                    </fieldset>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="project-start" className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-700">Start Date</label>
                        <input type="date" id="project-start" name="start_date" required defaultValue={today} className={inputClass} />
                      </div>
                      <div>
                        <label htmlFor="project-end" className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-700">Target End Date</label>
                        <input type="date" id="project-end" name="end_date" className={inputClass} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-8 flex justify-end gap-3">
                    <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                    <button type="submit" disabled={pending} className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                      <Check className="h-4 w-4" aria-hidden="true" /> Save Project
                    </button>
                  </div>
                </>
              )}
            </ActionForm>
          </div>
        </div>
      )}
    </>
  );
}
