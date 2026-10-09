"use client";

import { createContext, useContext, useState, useTransition, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from "react";
import type { ActionState } from "@/lib/form";

interface ActionFormProps {
  action: (form: FormData) => Promise<ActionState | void>;
  // A render function only works from client components; server components use SubmitButton.
  children: ReactNode | ((pending: boolean) => ReactNode);
  className?: string;
  // Asked with window.confirm before submitting, for destructive actions.
  confirm?: string;
  // Where the result message appears relative to the form.
  messagePosition?: "top" | "bottom" | "none";
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
}

const PendingContext = createContext(false);

// Submit button that disables itself while its ActionForm is saving. Usable from server components.
export function SubmitButton({ children, pendingText, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: ReactNode }) {
  const pending = useContext(PendingContext);
  return (
    <button type="submit" {...props} disabled={pending || props.disabled}>
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

// Submits a server action without React's automatic form reset, so a rejected submission keeps
// everything the user typed. The action returns an error/success message or redirects.
export default function ActionForm({ action, children, className, confirm, messagePosition = "top", resetOnSuccess, onSuccess }: ActionFormProps) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (confirm && !window.confirm(confirm)) return;
    const form = event.currentTarget;
    const data = new FormData(form, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(async () => {
      const result = (await action(data)) ?? null;
      setState(result);
      // Compact forms (icon buttons) have no message area; still never drop an error silently.
      const errorText = result?.errors?.join("\n") || result?.error;
      if (messagePosition === "none" && errorText) window.alert(errorText);
      if (result && !result.error && !result.errors?.length) {
        if (resetOnSuccess) form.reset();
        onSuccess?.();
      }
    });
  }

  const message = messagePosition === "none" ? null : <FormMessage state={state} />;
  return (
    <form onSubmit={handleSubmit} className={className} aria-busy={pending}>
      <PendingContext.Provider value={pending}>
        {messagePosition === "top" && message}
        {typeof children === "function" ? children(pending) : children}
        {messagePosition === "bottom" && message}
      </PendingContext.Provider>
    </form>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  const errors = state.errors?.length ? state.errors : state.error ? [state.error] : [];
  if (errors.length) {
    return (
      <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        {errors.length === 1 ? errors[0] : <ul className="list-disc space-y-1 pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      </div>
    );
  }
  if (state.success) {
    return <div role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{state.success}</div>;
  }
  return null;
}
