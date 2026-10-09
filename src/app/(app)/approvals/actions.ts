"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser, UserError } from "@/lib/auth";
import { activateLegacyApproval, adjustEstimatedDuration, decideApproval, setFpmEstimate, transitionFpmStatus } from "@/lib/approval";
import { toggleChecklistItem } from "@/lib/checklist";
import { isDocType } from "@/lib/documents";
import { deliverDocumentApprovalEmail } from "@/lib/email";
import { positiveInt, str, type ActionState } from "@/lib/form";

// Decisions on one document (approve_action.php / checklist_action.php). These do not require a
// menu: the requester and approvers reach the detail page from an email link, and every
// function below checks that this account may act on this document.

async function run(fn: () => Promise<string>, afterCommit?: () => Promise<void>): Promise<ActionState> {
  try {
    const success = await fn();
    if (afterCommit) await afterCommit();
    revalidatePath("/", "layout");
    return { success };
  } catch (error) {
    if (error instanceof UserError) return { error: error.message };
    console.error("Approval action failed:", error);
    return { error: "Tindakan belum tersimpan. Silakan coba kembali." };
  }
}

function docTarget(form: FormData) {
  const type = str(form, "type");
  const id = positiveInt(form, "id");
  if (!isDocType(type) || !id) throw new UserError("Parameter tidak valid.");
  return { type, id };
}

export async function decisionAction(form: FormData): Promise<ActionState> {
  let target: ReturnType<typeof docTarget> | null = null;
  return run(async () => {
    const user = await requireActionUser();
    target = docTarget(form);
    return decideApproval(target.type, target.id, user, str(form, "action"), str(form, "note"), Number(str(form, "cycle")), Number(str(form, "position")));
  }, async () => {
    if (target) await deliverDocumentApprovalEmail(target.type, target.id);
  });
}

export async function activateApprovalAction(form: FormData): Promise<ActionState> {
  let target: ReturnType<typeof docTarget> | null = null;
  return run(async () => {
    const user = await requireActionUser();
    target = docTarget(form);
    await activateLegacyApproval(target.type, target.id, user);
    return "Jalur approval diaktifkan. Menunggu approver tahap pertama.";
  }, async () => {
    if (target) await deliverDocumentApprovalEmail(target.type, target.id);
  });
}

export async function adjustDurationAction(form: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireActionUser();
    const { type, id } = docTarget(form);
    const raw = str(form, "duration_value").trim();
    if (raw !== "" && !/^\d{1,8}$/.test(raw)) throw new UserError("Estimasi hari harus berupa angka positif atau dikosongkan.");
    return adjustEstimatedDuration(type, id, raw === "" ? null : Number(raw), user);
  });
}

export async function fpmEstimateAction(form: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireActionUser();
    const raw = str(form, "duration_value").trim();
    if (raw !== "" && !/^\d{1,3}$/.test(raw)) throw new UserError("Estimasi hari harus berupa angka bulat 1-999, atau dikosongkan.");
    return setFpmEstimate(positiveInt(form, "id"), raw === "" ? null : Number(raw), user);
  });
}

export async function fpmTransitionAction(form: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireActionUser();
    return transitionFpmStatus(positiveInt(form, "id"), str(form, "action"), user);
  });
}

export async function checklistAction(form: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireActionUser();
    const itemId = positiveInt(form, "item_id");
    if (!itemId) throw new UserError("Parameter tidak valid.");
    await toggleChecklistItem(str(form, "type"), itemId, str(form, "field"), user, form.has("note") ? str(form, "note") : null);
    return "Checklist diperbarui.";
  });
}
