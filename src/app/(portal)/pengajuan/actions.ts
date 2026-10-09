"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActionUser, UserError } from "@/lib/auth";
import { detailUrl, isDocType } from "@/lib/documents";
import { deliverDocumentApprovalEmail } from "@/lib/email";
import { str, type ActionState } from "@/lib/form";
import { saveApprovalSubmission, saveFpm } from "@/lib/submission";

// FPA / FPA-A submission and revision. revisionId is bound by the page (0 for a new submission).
export async function submitApprovalAction(type: string, revisionId: number, form: FormData): Promise<ActionState> {
  let savedId: number;
  try {
    if (!isDocType(type)) throw new UserError("Jenis dokumen tidak valid.");
    // A revision is opened from the detail page, which the requester may reach without the menu.
    const user = await requireActionUser(revisionId ? undefined : "pengajuan");
    savedId = await saveApprovalSubmission(type, form, user, revisionId, Number(str(form, "cycle")) || 0);
  } catch (error) {
    if (error instanceof UserError) return { error: error.message };
    console.error("Submission failed:", error);
    return { error: "Pengajuan belum tersimpan. Silakan coba kembali." };
  }
  await deliverDocumentApprovalEmail(type, savedId);
  revalidatePath("/", "layout");
  redirect(`${detailUrl(type, savedId)}?notice=${revisionId ? "resubmitted" : "submitted"}`);
}

export async function submitFpmAction(form: FormData): Promise<ActionState> {
  try {
    const user = await requireActionUser("pengajuan");
    await saveFpm(form, user);
  } catch (error) {
    if (error instanceof UserError) return { error: error.message };
    console.error("FPM submission failed:", error);
    return { error: "Gagal menyimpan laporan. Silakan coba kembali." };
  }
  revalidatePath("/", "layout");
  return { success: "Permintaan maintenance berhasil dilaporkan! Tim IT akan segera menindaklanjuti." };
}
