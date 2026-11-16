import "server-only";
import { db, exec, row, rows, type Db } from "./db";
import { UserError, type CurrentUser } from "./auth";
import { STAGE_LABEL, STAGES, type Stage } from "./documents";
import { DEFAULT_APPROVAL_LIMITS, DEFAULT_COMPLETION_LIMITS, DEFAULT_WORKDAYS, MAX_APPROVAL_LIMIT, MIN_APPROVAL_LIMIT, type CompletionLimitKey } from "./workdays";

// Working days set by Admin in the Users menu; Monday to Saturday until one is saved.
export async function workingDays(conn: Db = db): Promise<number[]> {
  const found = await row<{ setting_value: string }>(conn, "SELECT setting_value FROM app_settings WHERE setting_key = 'hari_kerja'");
  const days = found ? found.setting_value.split(",").filter((day) => /^[0-6]$/.test(day)).map(Number) : [];
  return days.length ? days : DEFAULT_WORKDAYS;
}

export async function saveWorkingDays(days: number[], admin: CurrentUser): Promise<string> {
  if (admin.role !== "Admin") throw new UserError("Hanya Admin yang dapat mengatur hari kerja.");
  const unique = [...new Set(days)].sort();
  if (unique.length === 0) throw new UserError("Pilih minimal satu hari kerja.");
  if (!unique.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)) throw new UserError("Pilihan hari kerja tidak valid.");
  await exec(db, "INSERT INTO app_settings (setting_key, setting_value) VALUES ('hari_kerja', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)", [unique.join(",")]);
  return "Hari kerja disimpan.";
}

const validLimit = (days: number) => Number.isInteger(days) && days >= MIN_APPROVAL_LIMIT && days <= MAX_APPROVAL_LIMIT;

// Working days each stage has to decide (app_settings key batas_approval, "atasan=2,tim_it=2,...").
// A stage missing from the saved value keeps its default.
export async function approvalLimits(conn: Db = db): Promise<Record<Stage, number>> {
  const found = await row<{ setting_value: string }>(conn, "SELECT setting_value FROM app_settings WHERE setting_key = 'batas_approval'");
  const limits = { ...DEFAULT_APPROVAL_LIMITS };
  for (const pair of found?.setting_value.split(",") ?? []) {
    const [stage, value] = pair.split("=");
    if ((STAGES as string[]).includes(stage) && /^\d{1,2}$/.test(value ?? "") && validLimit(Number(value))) limits[stage as Stage] = Number(value);
  }
  return limits;
}

// Applies to stages opened afterwards; a stage already waiting keeps the deadline it opened with.
export async function saveApprovalLimits(limits: Record<Stage, number>, admin: CurrentUser): Promise<string> {
  if (admin.role !== "Admin") throw new UserError("Hanya Admin yang dapat mengatur batas waktu approval.");
  for (const stage of STAGES) {
    if (!validLimit(limits[stage])) throw new UserError(`Batas waktu ${STAGE_LABEL[stage]} harus berupa angka bulat ${MIN_APPROVAL_LIMIT}-${MAX_APPROVAL_LIMIT} hari kerja.`);
  }
  const value = STAGES.map((stage) => `${stage}=${limits[stage]}`).join(",");
  await exec(db, "INSERT INTO app_settings (setting_key, setting_value) VALUES ('batas_approval', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)", [value]);
  return "Batas waktu approval disimpan.";
}

const COMPLETION_SETTING: Record<CompletionLimitKey, string> = { test: "batas_pengujian", revisi_fpaa: "batas_revisi_fpaa" };
export const COMPLETION_LIMIT_LABEL: Record<CompletionLimitKey, string> = { test: "Pengujian item oleh pemohon", revisi_fpaa: "Kirim ulang revisi FPA-A" };

// Working-day windows after approval (see DEFAULT_COMPLETION_LIMITS); a missing or invalid row keeps the default.
export async function completionLimits(conn: Db = db): Promise<Record<CompletionLimitKey, number>> {
  const found = await rows<{ setting_key: string; setting_value: string }>(conn, "SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?, ?)", Object.values(COMPLETION_SETTING));
  const limits = { ...DEFAULT_COMPLETION_LIMITS };
  for (const key of Object.keys(COMPLETION_SETTING) as CompletionLimitKey[]) {
    const value = found.find((item) => item.setting_key === COMPLETION_SETTING[key])?.setting_value ?? "";
    if (/^\d{1,2}$/.test(value) && validLimit(Number(value))) limits[key] = Number(value);
  }
  return limits;
}

// Applies to windows opened afterwards; an item or revision already counting keeps its deadline.
export async function saveCompletionLimits(limits: Record<CompletionLimitKey, number>, admin: CurrentUser): Promise<string> {
  if (admin.role !== "Admin") throw new UserError("Hanya Admin yang dapat mengatur batas waktu pengujian dan revisi.");
  for (const key of Object.keys(COMPLETION_SETTING) as CompletionLimitKey[]) {
    if (!validLimit(limits[key])) throw new UserError(`Batas ${COMPLETION_LIMIT_LABEL[key]} harus berupa angka bulat ${MIN_APPROVAL_LIMIT}-${MAX_APPROVAL_LIMIT} hari kerja.`);
  }
  for (const key of Object.keys(COMPLETION_SETTING) as CompletionLimitKey[]) {
    await exec(db, "INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)", [COMPLETION_SETTING[key], String(limits[key])]);
  }
  return "Batas waktu pengujian dan revisi disimpan.";
}
