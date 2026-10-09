"use client";

import { Lock, User } from "lucide-react";
import ActionForm from "@/components/ActionForm";
import { loginAction } from "./actions";

export default function LoginForm({ next }: { next: string }) {
  return (
    <ActionForm action={loginAction} className="space-y-5">
      {(pending) => (
        <>
          <input type="hidden" name="next" value={next} />
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-semibold text-gray-700">Username atau Gmail</label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" aria-hidden="true" />
              <input id="username" type="text" name="username" autoComplete="username" required placeholder="nama.user atau nama@gmail.com"
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-semibold text-gray-700">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" aria-hidden="true" />
              <input id="password" type="password" name="password" autoComplete="current-password" required placeholder="••••••••"
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
          </div>
          <p className="text-xs text-gray-500">Gunakan username/Gmail dan password aplikasi Absensi.</p>
          <button type="submit" disabled={pending}
            className="mt-4 w-full rounded-lg bg-indigo-600 py-2.5 font-bold text-white shadow-md shadow-indigo-200 transition-colors hover:bg-indigo-700 disabled:opacity-60">
            {pending ? "Memeriksa..." : "Sign In"}
          </button>
        </>
      )}
    </ActionForm>
  );
}
