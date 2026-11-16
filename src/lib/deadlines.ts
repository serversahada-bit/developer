import { addDays, daysBetween } from "./dates";
import { addWorkingDays, workingDaysBetween } from "./workdays";

// Deadline of an FPA/FPA-A: base date plus duration days, or null when either is missing.
export function computeTaskDeadline(baseDate: string | null, duration: unknown): string | null {
  if (!baseDate || duration === null || duration === undefined || duration === "") return null;
  const days = Number(duration);
  if (!Number.isFinite(days) || days < 0) return null;
  return addDays(baseDate, Math.trunc(days));
}

interface FpaTiming {
  tanggal_pengajuan: string | null;
  estimasi_durasi: number | string | null;
  estimasi_durasi_admin: number | string | null;
  estimasi_selesai: string | null;
  estimasi_selesai_admin: string | null;
}

// The estimated finish date (Admin's correction first) plus approved FPA-A days as working days.
// FPAs from before the finish date existed keep counting calendar days from tanggal_pengajuan.
export function fpaDeadline(fpa: FpaTiming, extraDays: number, workdays: number[]): string | null {
  const finish = fpa.estimasi_selesai_admin ?? fpa.estimasi_selesai;
  if (finish) return addWorkingDays(finish, extraDays, workdays);
  const duration = fpa.estimasi_durasi_admin ?? fpa.estimasi_durasi;
  return computeTaskDeadline(fpa.tanggal_pengajuan, duration !== null && duration !== "" ? Number(duration) + extraDays : duration);
}

// FPAs from before the finish date existed have a calendar-day deadline.
export function fpaCalendarDeadline(fpa: Pick<FpaTiming, "estimasi_selesai" | "estimasi_selesai_admin">): boolean {
  return !(fpa.estimasi_selesai_admin ?? fpa.estimasi_selesai);
}

// Days a finished FPA / FPA-A came in after its deadline (0 = on time): working days, or calendar
// days when `workdays` is null (old FPAs). Null when either date is unknown.
export function documentLateDays(deadline: string | null, finished: string | null, workdays: number[] | null): number | null {
  if (!deadline || !finished) return null;
  if (workdays === null) return Math.max(0, daysBetween(deadline, finished));
  return workingDaysBetween(deadline, finished, workdays);
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
