import "server-only";
import { db, rows } from "./db";

export const LOG_STATUSES = ["Belum Selesai", "Dalam Proses", "Selesai"] as const;
export type LogStatus = (typeof LOG_STATUSES)[number];

export interface DailyLog {
  id: number;
  log_date: string;
  deadline: string | null;
  project_name: string | null;
  task_name: string;
  description: string | null;
  status: LogStatus;
  completed_at: string | null;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  category: "FPA" | "Non-FPA";
  start_date: string | null;
  end_date: string | null;
  status: "Active" | "Completed";
  created_at: string;
}

export async function projectNames(): Promise<string[]> {
  return (await rows<{ name: string }>(db, "SELECT name FROM projects ORDER BY name ASC")).map((p) => p.name);
}

export function progressOf(completed: number, total: number): { progress: number; color: string } {
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const color = progress === 100 ? "bg-green-500" : progress < 30 ? "bg-yellow-500" : "bg-indigo-600";
  return { progress, color };
}
