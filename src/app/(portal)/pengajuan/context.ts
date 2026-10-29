import "server-only";
import { approvalPreview, approvalSteps } from "@/lib/approval";
import { UserError, type CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { DocType } from "@/lib/documents";
import { revisionFormData, type RevisionData } from "@/lib/submission";
import type { FormContext } from "./FormParts";

// What the FPA / FPA-A form needs: the account, the approval stages it would go through, the
// revision notes, and the stored document when ?revision= is set and this account may revise it.
export async function loadFormContext(type: DocType, user: CurrentUser, revisionParam: unknown): Promise<{ context: FormContext; revision: RevisionData | null; error?: string }> {
  const userInfo = { full_name: user.full_name, role: user.role, username: user.username, division: user.division };
  const empty: FormContext = { user: userInfo, route: [], routeProblems: [], revision: null };
  const revisionId = typeof revisionParam === "string" && /^[1-9][0-9]{0,9}$/.test(revisionParam) ? Number(revisionParam) : 0;
  if (typeof revisionParam === "string" && revisionParam !== "" && !revisionId) {
    return { context: empty, revision: null, error: "Nomor revisi tidak valid." };
  }
  let revision: RevisionData | null = null;
  if (revisionId) {
    try {
      revision = await revisionFormData(type, revisionId, user);
    } catch (error) {
      if (error instanceof UserError) return { context: empty, revision: null, error: error.message };
      throw error;
    }
  }
  const { route, problems } = await approvalPreview(user.id);
  const notes = revision ? (await approvalSteps(db, revision.run)).filter((step) => step.state === "revision").map(({ approver_name, note }) => ({ approver_name, note })) : [];
  return { context: { ...empty, route, routeProblems: problems, revision: revision ? { cycle: revision.run.cycle, notes } : null }, revision };
}

export function revisionIdOf(revisionParam: unknown): number {
  return typeof revisionParam === "string" && /^[1-9][0-9]{0,9}$/.test(revisionParam) ? Number(revisionParam) : 0;
}
