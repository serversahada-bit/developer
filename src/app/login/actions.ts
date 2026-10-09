"use server";

import { redirect } from "next/navigation";
import { allowedLoginDestination, authenticateLogin, startSession } from "@/lib/auth";
import { str, type ActionState } from "@/lib/form";

export async function loginAction(form: FormData): Promise<ActionState> {
  const identifier = str(form, "username").trim();
  const password = str(form, "password");
  const [userId, error] = await authenticateLogin(identifier, password);
  if (!userId) return { error: error ?? undefined };
  await startSession(userId);
  redirect(allowedLoginDestination(str(form, "next")));
}
