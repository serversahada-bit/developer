import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { canUseMenu, requireUser } from "@/lib/auth";
import { db, rows } from "@/lib/db";
import { daysInMonth, monthName, todayWib, weekdayOf } from "@/lib/dates";
import type { DailyLog } from "@/lib/logs";
import { AccessDenied } from "@/components/ui";
import CalendarGrid, { type CalendarCell } from "./CalendarGrid";

export const metadata: Metadata = { title: "Calendar" };

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const user = await requireUser("/calendar");
  if (!canUseMenu(user, "calendar")) return <AccessDenied user={user} />;

  const params = await searchParams;
  const today = todayWib();
  let month = Number(params.month) || Number(today.slice(5, 7));
  let year = Number(params.year) || Number(today.slice(0, 4));
  if (month < 1) { month = 12; year--; }
  if (month > 12) { month = 1; year++; }
  if (year < 1970 || year > 9999) year = Number(today.slice(0, 4));

  const pad = (n: number) => String(n).padStart(2, "0");
  const first = `${year}-${pad(month)}-01`;
  const totalDays = daysInMonth(year, month);
  const logs = await rows<DailyLog>(db, "SELECT * FROM daily_logs WHERE log_date BETWEEN ? AND ? ORDER BY log_date ASC, created_at ASC", [first, `${year}-${pad(month)}-${pad(totalDays)}`]);

  // Monday is the first column.
  const startPadding = (weekdayOf(first) + 6) % 7;
  const cells: CalendarCell[] = Array.from({ length: startPadding }, () => ({ date: null, day: 0, label: "", isToday: false, logs: [] }));
  for (let day = 1; day <= totalDays; day++) {
    const date = `${year}-${pad(month)}-${pad(day)}`;
    cells.push({
      date,
      day,
      label: `${HARI[weekdayOf(date)]}, ${day} ${BULAN[month - 1]} ${year}`,
      isToday: date === today,
      logs: logs.filter((log) => log.log_date.slice(0, 10) === date).map(({ id, task_name, project_name, description, status }) => ({ id, task_name, project_name, description, status })),
    });
  }
  while (cells.length % 7 !== 0 || cells.length < 35) cells.push({ date: null, day: 0, label: "", isToday: false, logs: [] });

  const prev = month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
  const next = month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };

  return (
    <>
      <div className="relative z-10 flex flex-col justify-between gap-4 border-b border-gray-100 bg-white px-8 py-5 shadow-sm sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600"><CalendarDays className="h-5 w-5" aria-hidden="true" /></div>
          <div>
            <h1 className="text-xl font-bold leading-none text-gray-900">Calendar</h1>
            <div className="mt-1 text-sm text-gray-500">Timeline aktivitas dan tugas harian</div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1.5">
          <Link href={`/calendar?month=${prev.month}&year=${prev.year}`} aria-label="Bulan sebelumnya" className="flex h-8 w-8 items-center justify-center rounded bg-white text-gray-600 transition-all hover:text-indigo-600 hover:shadow-sm"><ChevronLeft className="h-3.5 w-3.5" /></Link>
          <span className="min-w-[120px] text-center text-sm font-bold text-gray-800">{monthName(month)} {year}</span>
          <Link href={`/calendar?month=${next.month}&year=${next.year}`} aria-label="Bulan berikutnya" className="flex h-8 w-8 items-center justify-center rounded bg-white text-gray-600 transition-all hover:text-indigo-600 hover:shadow-sm"><ChevronRight className="h-3.5 w-3.5" /></Link>
          <div className="mx-1 h-5 w-px bg-gray-300" />
          <Link href="/calendar" className="rounded bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-indigo-700">Today</Link>
        </div>
      </div>
      <div className="flex-1 p-6 lg:p-10">
        <CalendarGrid cells={cells} />
      </div>
    </>
  );
}
