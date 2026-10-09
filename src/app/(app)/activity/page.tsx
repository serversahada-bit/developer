import type { Metadata } from "next";
import { CalendarDays, CheckIcon, ClipboardList, Clock, Flag, Folder, Loader2 } from "lucide-react";
import { canUseMenu, requireUser } from "@/lib/auth";
import { db, rows } from "@/lib/db";
import { addDays, formatDate, todayWib } from "@/lib/dates";
import { projectNames, type DailyLog } from "@/lib/logs";
import { AccessDenied, PageHeader } from "@/components/ui";
import LogModal, { AddLogButton, DeleteLogButton, EditLogButton } from "@/components/LogModal";

export const metadata: Metadata = { title: "Daily Activity Tracker" };

function dateLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return formatDate(date, "l, d F Y");
}

const STATUS_STYLE: Record<string, { icon: typeof CheckIcon; iconClass: string; badge: string }> = {
  Selesai: { icon: CheckIcon, iconClass: "bg-green-100 text-green-600 border-green-200", badge: "bg-green-100 text-green-700 border-green-200" },
  "Dalam Proses": { icon: Loader2, iconClass: "bg-yellow-100 text-yellow-600 border-yellow-200", badge: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  "Belum Selesai": { icon: Clock, iconClass: "bg-blue-100 text-blue-600 border-blue-200", badge: "bg-blue-100 text-blue-700 border-blue-200" },
};

export default async function ActivityPage() {
  const user = await requireUser("/activity");
  if (!canUseMenu(user, "activity_log")) return <AccessDenied user={user} />;

  const [logs, projects] = await Promise.all([
    rows<DailyLog>(db, "SELECT * FROM daily_logs ORDER BY log_date DESC, created_at DESC"),
    projectNames(),
  ]);
  const today = todayWib();
  const grouped = new Map<string, DailyLog[]>();
  for (const log of logs) {
    const key = log.log_date.slice(0, 10);
    grouped.set(key, [...(grouped.get(key) ?? []), log]);
  }

  return (
    <>
      <PageHeader crumbs={["My Work", "IT PSLU"]} title="Daily Activity Log">
        <AddLogButton />
      </PageHeader>
      <div className="flex-1 p-6 lg:p-10">
        <div className="mx-auto max-w-3xl">
          {logs.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-16 text-gray-400 shadow-sm">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-gray-100 bg-gray-50"><ClipboardList className="h-7 w-7 text-gray-300" /></div>
              <h2 className="mb-1 text-lg font-medium text-gray-600">No activities logged</h2>
              <p className="mb-6 text-sm">You haven&apos;t added any daily logs yet.</p>
              <AddLogButton label="Add First Log" className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700" />
            </div>
          )}
          {[...grouped.entries()].map(([date, dayLogs]) => (
            <section key={date} className="mb-10">
              <h2 className="mb-6 flex items-center text-sm font-bold text-gray-800">
                <span className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-gray-600 shadow-sm">
                  <CalendarDays className="h-4 w-4 text-indigo-500" aria-hidden="true" /> {dateLabel(date, today)}
                </span>
              </h2>
              <ol className="relative pl-12 before:absolute before:bottom-0 before:left-4 before:top-0 before:w-0.5 before:bg-gray-200">
                {dayLogs.map((log) => {
                  const style = STATUS_STYLE[log.status] ?? STATUS_STYLE["Belum Selesai"];
                  const Icon = style.icon;
                  const overdue = log.deadline && log.deadline < today && log.status !== "Selesai";
                  return (
                    <li key={log.id} className="group relative pb-10 last:pb-4">
                      <span className={`absolute -left-[2.85rem] flex h-8 w-8 items-center justify-center rounded-full border bg-white shadow-[0_0_0_4px_#fafafa] ${style.iconClass}`}>
                        <Icon className={`h-3 w-3 ${log.status === "Dalam Proses" ? "animate-spin" : ""}`} aria-hidden="true" />
                      </span>
                      <div className="relative rounded-xl border border-gray-200 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] transition-colors hover:border-indigo-200">
                        <div className="absolute right-4 top-4 flex gap-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                          <EditLogButton log={log} />
                          <DeleteLogButton id={log.id} />
                        </div>
                        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-4">
                          <div className="w-12 pt-0.5 text-xs font-semibold text-gray-400">{formatDate(log.created_at, "H:i")}</div>
                          <div className="flex-1 pr-16">
                            <h3 className="mb-1 text-base font-bold leading-tight text-gray-900">{log.task_name}</h3>
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[10px] text-gray-400">LOG-{String(log.id).padStart(3, "0")}</span>
                              {log.project_name && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-purple-100 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                                  <Folder className="h-2.5 w-2.5 opacity-70" aria-hidden="true" /> {log.project_name}
                                </span>
                              )}
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}>{log.status}</span>
                              {log.deadline && (
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${overdue ? "border-red-200 bg-red-50 text-red-700" : "border-orange-100 bg-orange-50 text-orange-700"}`}>
                                  <Flag className="h-2.5 w-2.5 opacity-70" aria-hidden="true" /> {formatDate(log.deadline, "d M Y")}
                                </span>
                              )}
                            </div>
                            {log.description && (
                              <div className="whitespace-pre-line rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm leading-relaxed text-gray-600">{log.description}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      </div>
      <LogModal projects={projects} today={today} />
    </>
  );
}
