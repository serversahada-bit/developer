"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, CheckCircle2, Circle, Clock, Coffee, X } from "lucide-react";

export interface CalendarLog {
  id: number;
  task_name: string;
  project_name: string | null;
  description: string | null;
  status: string;
}

export interface CalendarCell {
  date: string | null; // null for padding cells
  day: number;
  label: string; // e.g. "Kamis, 9 Oktober 2026"
  isToday: boolean;
  logs: CalendarLog[];
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarGrid({ cells }: { cells: CalendarCell[] }) {
  const [selected, setSelected] = useState<CalendarCell | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setSelected(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-center">
          {DAYS.map((day, index) => (
            <div key={day} className={`py-3 text-xs font-bold uppercase tracking-wider ${index >= 5 ? "text-red-500" : "text-gray-500"}`}>{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, index) => {
            if (!cell.date) return <div key={`pad-${index}`} className="min-h-[110px] border-b border-r border-gray-100 bg-gray-50/40" />;
            const done = cell.logs.filter((log) => log.status === "Selesai").length;
            const pending = cell.logs.length - done;
            return (
              <button key={cell.date} type="button" onClick={() => setSelected(cell)} aria-label={`${cell.label}: ${cell.logs.length} aktivitas`}
                className={`min-h-[110px] border-b border-r border-gray-100 p-3 text-left align-top transition-colors hover:bg-indigo-50/40 ${cell.isToday ? "bg-indigo-50/60" : ""}`}>
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${cell.isToday ? "bg-indigo-600 text-white shadow" : "text-gray-600"}`}>{cell.day}</span>
                {cell.logs.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {done > 0 && <span className="flex items-center gap-1 truncate rounded-md bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-700"><CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" /> {done} Selesai</span>}
                    {pending > 0 && <span className="flex items-center gap-1 truncate rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700"><Clock className="h-3 w-3 shrink-0" aria-hidden="true" /> {pending} Proses</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="day-modal-title" className="mx-auto flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 bg-indigo-50 px-6 py-4">
              <h2 id="day-modal-title" className="flex items-center gap-2 text-lg font-bold text-indigo-900"><CalendarCheck className="h-5 w-5" aria-hidden="true" /> {selected.label}</h2>
              <button type="button" onClick={() => setSelected(null)} aria-label="Tutup" className="rounded-md p-1 text-gray-400 hover:bg-white hover:text-gray-600"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
              {selected.logs.length === 0 ? (
                <div className="py-10 text-center">
                  <Coffee className="mx-auto mb-3 h-10 w-10 text-gray-300" aria-hidden="true" />
                  <p className="font-medium text-gray-500">Tidak ada aktivitas pada hari ini.</p>
                  <p className="mt-1 text-sm text-gray-400">Anda bebas dari tugas (atau lupa mencatat).</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {selected.logs.map((log) => {
                    const done = log.status === "Selesai";
                    return (
                      <li key={log.id} className={`flex items-start gap-4 rounded-lg border bg-white p-4 shadow-sm ${done ? "border-green-200" : "border-gray-200"}`}>
                        {done ? <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-green-500" aria-hidden="true" /> : <Circle className="mt-1 h-5 w-5 shrink-0 text-gray-300" aria-hidden="true" />}
                        <div className="flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <h3 className={`text-sm font-bold ${done ? "text-gray-500 line-through" : "text-gray-800"}`}>{log.task_name}</h3>
                            {log.project_name && <span className="whitespace-nowrap rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">{log.project_name}</span>}
                          </div>
                          <p className="mb-2 whitespace-pre-line text-xs text-gray-500">{log.description || "Tidak ada catatan tambahan."}</p>
                          <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${done ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>{log.status}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="flex justify-end border-t border-gray-200 bg-white p-4">
              <button type="button" onClick={() => setSelected(null)} className="rounded-md bg-gray-100 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">Tutup</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
