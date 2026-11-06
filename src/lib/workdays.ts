import { addDays, weekdayOf } from "./dates";
import type { Stage } from "./documents";

// Working days are weekday numbers, 0 = Sunday .. 6 = Saturday. Shared by the FPA form (browser)
// and the server, so nothing here touches the database.

export const WEEKDAY_LABELS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
export const DEFAULT_WORKDAYS = [1, 2, 3, 4, 5, 6];

// Fewest working days from the day an FPA is sent to its estimated finish date, per Skala Aplikasi.
export const SCALE_MIN_WORKDAYS: Record<string, number> = {
  "Kecil/Nemo Tetra": 14,
  "Menengah/Salmon": 28,
  "Besar/Whale": 90,
};

// The n-th working day after `date` (the day itself is not counted); `date` when n is 0.
export function addWorkingDays(date: string, n: number, workdays: number[]): string {
  if (workdays.length === 0) throw new Error("At least one working day is required.");
  let current = date.slice(0, 10);
  for (let counted = 0; counted < n; ) {
    current = addDays(current, 1);
    if (workdays.includes(weekdayOf(current))) counted++;
  }
  return current;
}

// Earliest estimated finish date allowed for an FPA sent on `sentDate`, or null for an unknown scale.
export function minimumFinishDate(sentDate: string, skala: string, workdays: number[]): string | null {
  const days = SCALE_MIN_WORKDAYS[skala];
  return days === undefined ? null : addWorkingDays(sentDate, days, workdays);
}

// --- Approval time limits -----------------------------------------------------------------

export const DEFAULT_APPROVAL_LIMITS: Record<Stage, number> = { atasan: 2, tim_it: 2, manager_it: 3, manager_fat: 4 };
export const MIN_APPROVAL_LIMIT = 1;
export const MAX_APPROVAL_LIMIT = 30;

// When a stage opened at `openedAt` (WIB 'YYYY-MM-DD HH:MM:SS') must be decided: the same clock time
// `days` working days later. A stage opened on a non-working day counts from 00:00 of the next working
// day. The reminder comes one working day earlier, and not at all for a one-day limit.
export function stageSchedule(openedAt: string, days: number, workdays: number[]): { due: string; remind: string | null } {
  let date = openedAt.slice(0, 10);
  let time = openedAt.slice(11, 19) || "00:00:00";
  if (!workdays.includes(weekdayOf(date))) {
    date = addWorkingDays(date, 1, workdays);
    time = "00:00:00";
  }
  return {
    due: `${addWorkingDays(date, days, workdays)} ${time}`,
    remind: days > 1 ? `${addWorkingDays(date, days - 1, workdays)} ${time}` : null,
  };
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// "Rabu, 11 Nov 2026 15.00" for a WIB datetime string. A deadline at midnight is the end of the day
// before, so it reads "Selasa, 10 Nov 2026 23.59".
export function formatDeadline(value: string): string {
  const midnight = (value.slice(11, 16) || "00:00") === "00:00";
  const date = midnight ? addDays(value, -1) : value.slice(0, 10);
  const [y, m, d] = date.split("-").map(Number);
  return `${WEEKDAY_LABELS[weekdayOf(date)]}, ${d} ${SHORT_MONTHS[m - 1]} ${y} ${midnight ? "23.59" : value.slice(11, 16).replace(":", ".")}`;
}
