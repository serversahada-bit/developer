import "server-only";
import { approvalRoute, approvalSteps } from "@/lib/approval";
import { UserError, type CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { DocType } from "@/lib/documents";
import { revisionFormData, type RevisionData } from "@/lib/submission";
import type { FormContext } from "./FormParts";

// What the FPA / FPA-A form needs: the account, the approval route (or the revision's own steps),
// and the stored document when ?revision= is set and this account may revise it.
export async function loadFormContext(type: DocType, user: CurrentUser, revisionParam: unknown): Promise<{ context: FormContext; revision: RevisionData | null; error?: string }> {
  const userInfo = { full_name: user.full_name, role: user.role, username: user.username, division: user.division };
  const revisionId = typeof revisionParam === "string" && /^[1-9][0-9]{0,9}$/.test(revisionParam) ? Number(revisionParam) : 0;
  if (typeof revisionParam === "string" && revisionParam !== "" && !revisionId) {
    return { context: { user: userInfo, route: [], revision: null }, revision: null, error: "Nomor revisi tidak valid." };
  }
  if (revisionId) {
    try {
      const revision = await revisionFormData(type, revisionId, user);
      const steps = await approvalSteps(db, revision.run);
      return { context: { user: userInfo, route: steps.map(({ approver_name, state, note }) => ({ approver_name, state, note })), revision: { cycle: revision.run.cycle } }, revision };
    } catch (error) {
      if (error instanceof UserError) return { context: { user: userInfo, route: [], revision: null }, revision: null, error: error.message };
      throw error;
    }
  }
  const route = await approvalRoute(db, user.id);
  return { context: { user: userInfo, route: route.map(({ approver_name }) => ({ approver_name })), revision: null }, revision: null };
}

export function revisionIdOf(revisionParam: unknown): number {
  return typeof revisionParam === "string" && /^[1-9][0-9]{0,9}$/.test(revisionParam) ? Number(revisionParam) : 0;
}
