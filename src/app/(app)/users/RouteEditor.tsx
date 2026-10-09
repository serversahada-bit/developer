"use client";

import { useState } from "react";
import ActionForm from "@/components/ActionForm";
import { saveRouteAction } from "./actions";

let stepKeySeq = 0;

// Ordered approvers of one requester; the same route applies to FPA and FPA-A.
export default function RouteEditor({ requesterId, initial, accounts }: { requesterId: number; initial: number[]; accounts: { id: number; label: string }[] }) {
  const [steps, setSteps] = useState(() => (initial.length ? initial : [0, 0]).map((id) => ({ id, key: stepKeySeq++ })));
  const choices = accounts.filter((account) => account.id !== requesterId);
  return (
    <ActionForm action={saveRouteAction}>
      {(pending) => (
        <>
          <input type="hidden" name="requester_id" value={requesterId} />
          <div className="space-y-3">
            {steps.map((step, index) => (
              <div key={step.key} className="flex items-end gap-3">
                <div className="flex-1">
                  <label htmlFor={`approver-${index}`} className="mb-2 block text-sm font-medium">Approver tahap {index + 1}</label>
                  <select id={`approver-${index}`} name="approver_ids" required defaultValue={step.id || ""} className="w-full rounded-lg border bg-white p-2.5">
                    <option value="">Pilih approver</option>
                    {choices.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
                  </select>
                </div>
                <button type="button" disabled={steps.length === 1} onClick={() => setSteps((current) => current.filter((s) => s.key !== step.key))}
                  className="rounded-lg border px-3 py-2.5 text-red-700 disabled:opacity-40">Hapus</button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" disabled={steps.length >= 20} onClick={() => setSteps((current) => [...current, { id: 0, key: stepKeySeq++ }])}
              className="rounded-lg border px-4 py-2 text-indigo-700 disabled:opacity-40">+ Tambah Tahap</button>
            <button type="submit" disabled={pending} className="rounded-lg bg-indigo-600 px-4 py-2 text-white disabled:opacity-60">Simpan Jalur</button>
          </div>
          <p className="mt-3 text-xs text-gray-500">Pengajuan yang sudah berjalan tetap memakai jalur saat dikirim. Pemohon tidak bisa menjadi approver sendiri.</p>
        </>
      )}
    </ActionForm>
  );
}
