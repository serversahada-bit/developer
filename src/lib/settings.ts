import "server-only";
import { db, exec, row, type Db } from "./db";
import { UserError, type CurrentUser } from "./auth";
import { DEFAULT_WORKDAYS } from "./workdays";

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
