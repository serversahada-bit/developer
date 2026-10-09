import type { Metadata } from "next";
import { Box, CheckCircle2, Circle, Eye, FileSpreadsheet, Inbox, Presentation } from "lucide-react";
import { canUseMenu, requireUser } from "@/lib/auth";
import { db, rows } from "@/lib/db";
import { currentWeekRange, formatDate, isDateString } from "@/lib/dates";
import type { DailyLog } from "@/lib/logs";
import { AccessDenied } from "@/components/ui";
import ReportActions, { type ReportData } from "./ReportActions";

export const metadata: Metadata = { title: "Reports & PPT Generator" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const user = await requireUser("/reports");
  if (!canUseMenu(user, "reports")) return <AccessDenied user={user} />;

  const params = await searchParams;
  const [weekStart, weekEnd] = currentWeekRange();
  const startDate = isDateString(params.start_date) ? params.start_date : weekStart;
  const endDate = isDateString(params.end_date) ? params.end_date : weekEnd;

  const logs = await rows<DailyLog>(db, "SELECT * FROM daily_logs WHERE log_date BETWEEN ? AND ? ORDER BY project_name ASC, log_date ASC", [startDate, endDate]);
  const grouped = new Map<string, DailyLog[]>();
  for (const log of logs) {
    const name = log.project_name || "General / Other Tasks";
    grouped.set(name, [...(grouped.get(name) ?? []), log]);
  }
  const report: ReportData = {
    startDate: formatDate(startDate, "d M Y"),
    endDate: formatDate(endDate, "d M Y"),
    totalTasks: logs.length,
    completedTasks: logs.filter((log) => log.status === "Selesai").length,
    projects: [...grouped.entries()].map(([name, tasks]) => [name, tasks.map(({ task_name, status }) => ({ task_name, status }))]),
  };
  const exportUrl = `/reports/export?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`;

  return (
    <>
      <div className="relative z-10 flex flex-col justify-between gap-4 border-b border-gray-100 bg-white px-8 py-5 shadow-sm lg:flex-row lg:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600"><Presentation className="h-5 w-5" aria-hidden="true" /></div>
          <div>
            <h1 className="text-xl font-bold leading-none text-gray-900">Reports Generator</h1>
            <div className="mt-1 text-sm text-gray-500">Export ringkasan aktivitas ke PowerPoint</div>
          </div>
        </div>
        <form method="GET" className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1.5">
          <label className="flex items-center gap-2 px-2 text-xs font-bold uppercase text-gray-500">From
            <input type="date" name="start_date" defaultValue={startDate} className="rounded border border-gray-200 bg-white px-2 py-1 text-sm font-normal normal-case text-gray-900 outline-none focus:border-indigo-500" />
          </label>
          <label className="flex items-center gap-2 border-l border-gray-200 px-2 text-xs font-bold uppercase text-gray-500">To
            <input type="date" name="end_date" defaultValue={endDate} className="rounded border border-gray-200 bg-white px-2 py-1 text-sm font-normal normal-case text-gray-900 outline-none focus:border-indigo-500" />
          </label>
          <button type="submit" className="ml-1 rounded bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700">Generate</button>
        </form>
        <a href={exportUrl} className="flex items-center gap-2 self-start rounded-lg bg-green-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-green-700 lg:self-auto">
          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> Export Excel
        </a>
      </div>
      <div className="flex flex-1 flex-col p-6 lg:p-10">
        <div className="mx-auto mb-6 flex w-full max-w-[1000px] flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-gray-500"><Eye className="h-4 w-4" aria-hidden="true" /> Slide Preview</h2>
          <ReportActions report={report} />
        </div>
        <div className="relative mx-auto w-full max-w-[1000px] rounded-lg border border-gray-200 bg-white p-8 shadow-md">
          <div className="mb-8 flex items-start justify-between border-b-2 border-indigo-100 pb-6">
            <div>
              <h2 className="text-3xl font-extrabold text-gray-900">Weekly IT Report</h2>
              <p className="mt-1 font-semibold text-indigo-600">Periode: {report.startDate} - {report.endDate}</p>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-5 py-3 text-center">
              <div className="text-3xl font-black text-indigo-600">{report.totalTasks}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Total Tasks</div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 pb-8 md:grid-cols-2">
            {report.projects.length === 0 ? (
              <div className="col-span-full py-10 text-center text-gray-400"><Inbox className="mx-auto mb-3 h-10 w-10" aria-hidden="true" />Tidak ada aktivitas pada rentang tanggal ini.</div>
            ) : (
              report.projects.map(([name, tasks]) => (
                <div key={name} className="rounded-xl border border-gray-200 p-5">
                  <h3 className="mb-3 flex items-center justify-between font-bold">
                    <span className="flex items-center gap-2 text-indigo-700"><Box className="h-4 w-4 text-indigo-400" aria-hidden="true" />{name}</span>
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700">{tasks.length}</span>
                  </h3>
                  <ul className="space-y-2 text-sm">
                    {tasks.map((task, i) => (
                      <li key={i} className="flex items-start gap-2">
                        {task.status === "Selesai" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" /> : <Circle className="mt-1.5 h-2 w-2 shrink-0 fill-yellow-400 text-yellow-400" />}
                        <span className={task.status === "Selesai" ? "text-gray-400 line-through" : ""}>{task.task_name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
          <div className="absolute bottom-4 right-8 text-sm font-medium text-gray-400">IT PSLU &bull; Generated System</div>
        </div>
      </div>
    </>
  );
}
