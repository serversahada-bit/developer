"use client";

import { useCallback, useEffect, useState } from "react";
import { Box, CheckCircle2, ChevronLeft, ChevronRight, Circle, FileDown, Play, X } from "lucide-react";

export interface ReportData {
  startDate: string; // "d M Y"
  endDate: string;
  totalTasks: number;
  completedTasks: number;
  projects: [string, { task_name: string; status: string }[]][];
}

// Same slide layout as the PHP generator: a title slide, then two projects per slide.
async function downloadPpt(report: ReportData) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.defineSlideMaster({
    title: "MASTER_SLIDE",
    background: { color: "F8FAFC" },
    objects: [
      { rect: { x: 0, y: 0, w: "100%", h: 0.1, fill: { color: "4F46E5" } } },
      { text: { text: "IT PSLU - Weekly Productivity Report", options: { x: 0.5, y: 0.2, w: 5, h: 0.3, color: "6B7280", fontSize: 10, fontFace: "Inter" } } },
      { rect: { x: 0, y: 7.1, w: "100%", h: 0.4, fill: { color: "FFFFFF" } } },
      { line: { x: 0, y: 7.1, w: "100%", h: 0, line: { color: "E5E7EB", width: 1 } } },
      { text: { text: "Generated Automatically by System", options: { x: 0.5, y: 7.15, w: 4, h: 0.3, color: "9CA3AF", fontSize: 9, fontFace: "Inter" } } },
    ],
  });

  const title = pptx.addSlide({ masterName: "MASTER_SLIDE" });
  title.addText("Weekly Activity Report", { x: 0.5, y: 1.5, w: "90%", h: 1, fontSize: 44, bold: true, color: "111827", fontFace: "Inter" });
  title.addText(`Periode: ${report.startDate} - ${report.endDate}`, { x: 0.5, y: 2.6, w: "90%", h: 0.5, fontSize: 18, color: "4F46E5", fontFace: "Inter", bold: true });
  const stats: [number, string, string, number][] = [[report.totalTasks, "TOTAL TASKS", "4F46E5", 0.5], [report.completedTasks, "COMPLETED", "059669", 3.8]];
  for (const [value, label, color, x] of stats) {
    title.addShape(pptx.ShapeType.roundRect, { x: x + 0.02, y: 3.72, w: 3, h: 1.5, fill: { color: "E2E8F0" }, rectRadius: 0.1 });
    title.addShape(pptx.ShapeType.roundRect, { x, y: 3.7, w: 3, h: 1.5, fill: { color: "FFFFFF" }, line: { color: "E5E7EB" }, rectRadius: 0.1 });
    title.addText(String(value), { x, y: 3.9, w: 3, h: 0.6, fontSize: 36, bold: true, color, align: "center", fontFace: "Inter" });
    title.addText(label, { x, y: 4.6, w: 3, h: 0.3, fontSize: 11, color: "6B7280", bold: true, align: "center", fontFace: "Inter" });
  }

  for (let index = 0; index < report.projects.length; index += 2) {
    const slide = pptx.addSlide({ masterName: "MASTER_SLIDE" });
    slide.addText("Task Breakdown", { x: 0.5, y: 0.8, w: 5, h: 0.6, fontSize: 28, bold: true, color: "111827", fontFace: "Inter" });
    report.projects.slice(index, index + 2).forEach(([name, tasks], column) => {
      const x = [0.5, 5.2][column];
      slide.addShape(pptx.ShapeType.roundRect, { x: x + 0.03, y: 1.63, w: 4.3, h: 5.0, fill: { color: "E2E8F0" }, rectRadius: 0.05 });
      slide.addShape(pptx.ShapeType.roundRect, { x, y: 1.6, w: 4.3, h: 5.0, fill: { color: "FFFFFF" }, line: { color: "E5E7EB" }, rectRadius: 0.05 });
      slide.addShape(pptx.ShapeType.rect, { x, y: 1.6, w: 4.3, h: 0.6, fill: { color: "EEF2FF" } });
      slide.addText(name, { x: x + 0.2, y: 1.6, w: 3.5, h: 0.6, fontSize: 14, bold: true, color: "3730A3", fontFace: "Inter", valign: "middle" });
      slide.addText(`${tasks.length} Tasks`, { x: x + 3.3, y: 1.6, w: 0.8, h: 0.6, fontSize: 10, bold: true, color: "4F46E5", fontFace: "Inter", valign: "middle", align: "right" });
      slide.addText(
        tasks.flatMap((task) => {
          const done = task.status === "Selesai";
          return [
            { text: `${done ? "✓" : "○"} `, options: { color: done ? "059669" : "D97706", bold: true } },
            { text: task.task_name, options: { color: done ? "9CA3AF" : "1F2937", breakLine: true } },
          ];
        }),
        { x: x + 0.2, y: 2.3, w: 3.9, h: 4.1, fontSize: 11, valign: "top", fontFace: "Inter", lineSpacing: 20 },
      );
    });
  }
  await pptx.writeFile({ fileName: `IT_Report_${report.startDate.replace(/ /g, "_")}.pptx` });
}

function Presentation({ report, onClose }: { report: ReportData; onClose: () => void }) {
  const pages = 1 + Math.ceil(report.projects.length / 2);
  const [current, setCurrent] = useState(0);
  const next = useCallback(() => setCurrent((c) => Math.min(c + 1, pages - 1)), [pages]);
  const prev = useCallback(() => setCurrent((c) => Math.max(c - 1, 0)), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === " ") next();
      else if (event.key === "ArrowLeft") prev();
      else if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.requestFullscreen?.().catch(() => undefined);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    };
  }, [next, prev, onClose]);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Presentasi laporan">
      <button type="button" onClick={onClose} aria-label="Keluar dari presentasi" className="absolute right-6 top-6 z-10 text-white/70 hover:text-white"><X className="h-7 w-7" /></button>
      <div className="relative flex-1 overflow-hidden bg-slate-50">
        <div className="absolute left-0 top-0 h-2 w-full bg-indigo-600" />
        {current === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <h2 className="mb-6 text-6xl font-extrabold tracking-tight text-gray-900">Weekly Activity Report</h2>
            <p className="mb-16 text-3xl font-semibold text-indigo-600">Periode: {report.startDate} - {report.endDate}</p>
            <div className="mt-8 flex gap-12">
              <div className="min-w-[250px] rounded-2xl border border-gray-200 bg-white p-8 shadow-xl"><div className="mb-4 text-7xl font-black text-indigo-600">{report.totalTasks}</div><div className="text-lg font-bold uppercase tracking-widest text-gray-500">Total Tasks</div></div>
              <div className="min-w-[250px] rounded-2xl border border-gray-200 bg-white p-8 shadow-xl"><div className="mb-4 text-7xl font-black text-green-600">{report.completedTasks}</div><div className="text-lg font-bold uppercase tracking-widest text-gray-500">Completed</div></div>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col p-16">
            <h2 className="mb-12 inline-block border-b-4 border-indigo-100 pb-4 text-5xl font-bold text-gray-900">Task Breakdown</h2>
            <div className="grid flex-1 grid-cols-2 gap-12 overflow-hidden">
              {report.projects.slice((current - 1) * 2, current * 2).map(([name, tasks]) => (
                <div key={name} className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
                  <div className="flex items-center justify-between border-b border-indigo-100 bg-indigo-50 px-8 py-5">
                    <h3 className="flex items-center gap-3 text-2xl font-bold text-indigo-900"><Box className="h-6 w-6 text-indigo-400" aria-hidden="true" />{name}</h3>
                    <span className="rounded-full bg-indigo-600 px-3 py-1 text-sm font-bold text-white">{tasks.length}</span>
                  </div>
                  <ul className="flex-1 overflow-y-auto p-8">
                    {tasks.map((task, i) => (
                      <li key={i} className="mb-4 flex items-start gap-4 text-xl">
                        {task.status === "Selesai" ? <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-green-500" /> : <Circle className="mt-1 h-4 w-4 shrink-0 fill-yellow-500 text-yellow-500" />}
                        <span className={task.status === "Selesai" ? "text-gray-400 line-through" : "font-medium text-gray-800"}>{task.task_name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-4 bg-black py-4">
        <button type="button" onClick={prev} aria-label="Slide sebelumnya" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronLeft className="h-5 w-5" /></button>
        <span className="px-4 text-sm font-bold tracking-widest text-white">{current + 1} / {pages}</span>
        <button type="button" onClick={next} aria-label="Slide berikutnya" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronRight className="h-5 w-5" /></button>
      </div>
    </div>
  );
}

export default function ReportActions({ report }: { report: ReportData }) {
  const [presenting, setPresenting] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex gap-3">
      <button type="button" onClick={() => setPresenting(true)} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-indigo-700">
        <Play className="h-4 w-4" aria-hidden="true" /> Present Here
      </button>
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await downloadPpt(report); } finally { setBusy(false); } }}
        className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#d24726] to-[#eb5a36] px-6 py-2.5 font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60">
        <FileDown className="h-4 w-4" aria-hidden="true" /> {busy ? "Menyiapkan..." : "Download PPT"}
      </button>
      {presenting && <Presentation report={report} onClose={() => setPresenting(false)} />}
    </div>
  );
}
