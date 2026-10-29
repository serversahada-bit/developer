"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, UserError } from "@/lib/auth";
import { saveManagerRoles } from "@/lib/approval";
import { positiveInt, str, type ActionState } from "@/lib/form";
import { loadKaryawan, type Karyawan } from "@/lib/identity";
import { createUser, deleteUser, updateUser } from "@/lib/users";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "Admin") throw new UserError("Hanya Admin yang dapat mengelola user.");
  return user;
}

async function karyawanOrNull(): Promise<Map<number, Karyawan> | null> {
  try {
    return await loadKaryawan();
  } catch (error) {
    console.error("Load karyawan failed:", (error as Error).message);
    return null;
  }
}

function fail(error: unknown): ActionState {
  if (error instanceof UserError) return { error: error.message };
  console.error("Users action failed:", error);
  return { error: "Perubahan belum tersimpan. Silakan coba kembali." };
}

export async function createUserAction(form: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const errors = await createUser(form, await karyawanOrNull());
    if (errors.length) return { errors };
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/users");
  redirect("/users?saved=created");
}

export async function updateUserAction(userId: number, form: FormData): Promise<ActionState> {
  let demotedSelf = false;
  try {
    const admin = await requireAdmin();
    const errors = await updateUser(userId, form, admin.id, await karyawanOrNull());
    if (errors.length) return { errors };
    demotedSelf = userId === admin.id && str(form, "role") !== "Admin";
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/", "layout");
  redirect(demotedSelf ? "/" : "/users?saved=updated");
}

export async function deleteUserAction(form: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const errors = await deleteUser(positiveInt(form, "user_id"), admin.id);
    if (errors.length) return { errors };
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/users");
  redirect("/users?saved=deleted");
}

export async function saveManagerRolesAction(form: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    await saveManagerRoles({ manager_it: positiveInt(form, "manager_it"), manager_fat: positiveInt(form, "manager_fat") }, admin);
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/", "layout");
  redirect("/users?saved=roles#approval-roles");
}
