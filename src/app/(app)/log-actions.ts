"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser, UserError } from "@/lib/auth";
import { db, exec, isForeignKeyBlock, row } from "@/lib/db";
import { isDateString, todayWib, wibDateTime } from "@/lib/dates";
import { positiveInt, str, type ActionState } from "@/lib/form";
import { LOG_STATUSES, type LogStatus } from "@/lib/logs";
import { LOG_MENUS } from "@/lib/menus";

// Mutations of daily logs and projects, shared by Projects, Activity Log and My Tasks (process.php).

function logStatus(value: string, fallback: LogStatus): LogStatus {
  return (LOG_STATUSES as readonly string[]).includes(value) ? (value as LogStatus) : fallback;
}

function optionalDate(value: string, label: string): string | null {
  if (value === "") return null;
  if (!isDateString(value)) throw new UserError(`${label} tidak valid.`);
  return value;
}

function logValues(form: FormData) {
  const taskName = str(form, "task_name").trim();
  if (taskName === "" || [...taskName].length > 255) throw new UserError("Nama task wajib diisi, maksimal 255 karakter.");
  const projectName = str(form, "project_name").trim();
  if ([...projectName].length > 100) throw new UserError("Nama project untuk task maksimal 100 karakter.");
  const description = str(form, "description");
  if ([...description].length > 10000) throw new UserError("Deskripsi maksimal 10.000 karakter.");
  return {
    log_date: optionalDate(str(form, "log_date"), "Tanggal") ?? todayWib(),
    deadline: optionalDate(str(form, "deadline"), "Deadline"),
    project_name: projectName,
    task_name: taskName,
    description,
    status: logStatus(str(form, "status"), "Belum Selesai"),
  };
}

function refreshLogPages() {
  revalidatePath("/", "layout");
}

async function run(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const success = await fn();
    refreshLogPages();
    return { success: success || "Operasi berhasil dilakukan!" };
  } catch (error) {
    if (error instanceof UserError) return { error: error.message };
    console.error("Log action failed:", error);
    return { error: "Perubahan belum tersimpan. Silakan coba kembali." };
  }
}

export async function saveLogAction(form: FormData): Promise<ActionState> {
  return run(async () => {
    await requireActionUser(LOG_MENUS);
    const values = logValues(form);
    const id = positiveInt(form, "id");
    if (!id) {
      await exec(db, "INSERT INTO daily_logs (log_date, deadline, project_name, task_name, description, status, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
        values.log_date, values.deadline, values.project_name, values.task_name, values.description, values.status,
        values.status === "Selesai" ? wibDateTime() : null,
      ]);
      return "Task berhasil dibuat.";
    }
    const old = await row(db, "SELECT status, completed_at FROM daily_logs WHERE id = ?", [id]);
    if (!old) throw new UserError("Task tidak ditemukan.");
    // A task that stays Selesai keeps its original completion time.
    const completedAt = values.status === "Selesai" ? (old.status === "Selesai" && old.completed_at ? old.completed_at : wibDateTime()) : null;
    await exec(db, "UPDATE daily_logs SET log_date = ?, deadline = ?, project_name = ?, task_name = ?, description = ?, status = ?, completed_at = ? WHERE id = ?", [
      values.log_date, values.deadline, values.project_name, values.task_name, values.description, values.status, completedAt, id,
    ]);
    return "Task berhasil diperbarui.";
  });
}

export async function deleteLogAction(form: FormData): Promise<ActionState> {
  return run(async () => {
    await requireActionUser(LOG_MENUS);
    await exec(db, "DELETE FROM daily_logs WHERE id = ?", [positiveInt(form, "id")]);
    return "Task dihapus.";
  });
}

export async function setLogStatusAction(form: FormData): Promise<ActionState> {
  return run(async () => {
    await requireActionUser(LOG_MENUS);
    const id = positiveInt(form, "id");
    const status = logStatus(str(form, "status"), "Selesai");
    await exec(db, "UPDATE daily_logs SET status = ?, completed_at = ? WHERE id = ?", [status, status === "Selesai" ? wibDateTime() : null, id]);
    return status === "Selesai" ? "Task ditandai selesai." : "Task dibuka kembali.";
  });
}

export async function createProjectAction(form: FormData): Promise<ActionState> {
  return run(async () => {
    await requireActionUser(LOG_MENUS);
    const name = str(form, "name").trim();
    if (name === "" || [...name].length > 200) throw new UserError("Nama project wajib diisi, maksimal 200 karakter.");
    const category = str(form, "category") === "FPA" ? "FPA" : "Non-FPA";
    const startDate = optionalDate(str(form, "start_date"), "Start date") ?? todayWib();
    const endDate = optionalDate(str(form, "end_date"), "Target end date");
    await exec(db, "INSERT INTO projects (name, description, category, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, 'Active')", [
      name, str(form, "description"), category, startDate, endDate,
    ]);
    return "Project berhasil dibuat.";
  });
}

// The project's tasks are kept, as before.
export async function deleteProjectAction(form: FormData): Promise<ActionState> {
  return run(async () => {
    await requireActionUser(LOG_MENUS);
    try {
      await exec(db, "DELETE FROM projects WHERE id = ?", [positiveInt(form, "id")]);
    } catch (error) {
      if (isForeignKeyBlock(error)) throw new UserError("Project ini dibuat dari pengajuan FPA/FPA-A yang disetujui dan tidak dapat dihapus.");
      throw error;
    }
    return "Project dihapus.";
  });
}
