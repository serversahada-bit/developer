import type { NextRequest } from "next/server";
import { canUseMenu, getCurrentUser } from "@/lib/auth";
import { db, rows } from "@/lib/db";
import { formatDate, isDateString, todayWib } from "@/lib/dates";
import type { DailyLog } from "@/lib/logs";

export const dynamic = "force-dynamic";

const escape = (value: unknown) =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// HTML table served as .xls, which Excel opens directly (same format as the PHP export).
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUseMenu(user, "reports")) return new Response("Akses dibatasi.", { status: 403 });

  const start = request.nextUrl.searchParams.get("start_date");
  const end = request.nextUrl.searchParams.get("end_date");
  const logs = isDateString(start) && isDateString(end)
    ? await rows<DailyLog>(db, "SELECT * FROM daily_logs WHERE log_date BETWEEN ? AND ? ORDER BY created_at ASC", [start, end])
    : await rows<DailyLog>(db, "SELECT * FROM daily_logs ORDER BY created_at ASC");

  const body = logs.map((log, index) => `<tr>
<td>${index + 1}</td><td>${escape(log.task_name)}</td><td>${escape(log.project_name)}</td>
<td>${formatDate(log.created_at, "d-m-Y H:i")}</td><td>${formatDate(log.deadline, "d-m-Y")}</td>
<td>${formatDate(log.completed_at, "d-m-Y H:i")}</td><td>${escape(log.status)}</td></tr>`).join("\n");
  const html = `﻿<table border="1"><thead><tr><th>No</th><th>Task</th><th>Project</th><th>Tanggal Dibuat</th><th>Deadline</th><th>Tanggal Selesai</th><th>Status</th></tr></thead><tbody>
${body}
</tbody></table>`;

  return new Response(html, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="Task_Report_${todayWib()}.xls"`,
      "Cache-Control": "no-store",
    },
  });
}
