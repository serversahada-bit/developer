import { addDays, weekdayOf } from "./dates";

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
