import { addDays, daysBetween } from "./dates";

// Deadline of an FPA/FPA-A: base date plus duration days, or null when either is missing.
export function computeTaskDeadline(baseDate: string | null, duration: unknown): string | null {
  if (!baseDate || duration === null || duration === undefined || duration === "") return null;
  const days = Number(duration);
  if (!Number.isFinite(days) || days < 0) return null;
  return addDays(baseDate, Math.trunc(days));
}

interface FpmTiming {
  estimasi_durasi: number | null;
  diproses_at: string | null;
  tanggal_selesai?: string | null;
}

// Deadline once the report is being worked on and has an estimate; otherwise null.
export function fpmDeadline(fpm: FpmTiming): string | null {
  if (fpm.estimasi_durasi === null || !fpm.diproses_at) return null;
  return addDays(fpm.diproses_at.slice(0, 10), Number(fpm.estimasi_durasi));
}

// Days a closed report finished past its deadline (0 = on time); null when either date is unknown.
export function fpmLateDays(fpm: FpmTiming): number | null {
  const deadline = fpmDeadline(fpm);
  if (deadline === null || !fpm.tanggal_selesai) return null;
  return Math.max(0, daysBetween(deadline, fpm.tanggal_selesai));
}
