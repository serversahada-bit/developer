import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { allowedLoginDestination, getCurrentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Login Developer" };

const SSO_ERRORS: Record<string, string> = {
  sso: "Tautan masuk dari Great tidak valid atau sudah kedaluwarsa. Silakan coba lagi dari Great atau login di bawah.",
  inactive: "Akun Anda telah dinonaktifkan. Silakan hubungi HRD.",
  unregistered: "Akun Anda belum didaftarkan di aplikasi Developer. Hubungi Admin.",
  unavailable: "Data karyawan tidak dapat dihubungi. Silakan coba beberapa saat lagi.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = allowedLoginDestination(params.next);
  if (await getCurrentUser()) redirect(next);
  const ssoError = typeof params.error === "string" ? SSO_ERRORS[params.error] : undefined;
  const greatUrl = process.env.GREAT_URL;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-100 p-6">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
        <div className="relative overflow-hidden bg-indigo-600 p-8 text-center">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white opacity-10" />
          <div className="relative z-10 mb-4 inline-flex h-16 w-16 items-center justify-center rounded-xl bg-white p-2 shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.ico" alt="Logo" className="h-full w-full object-contain" />
          </div>
          <h1 className="relative z-10 text-2xl font-bold text-white">Developer Area</h1>
          <p className="relative z-10 mt-2 text-sm text-indigo-100">Masuk untuk mengakses IT Dashboard</p>
        </div>
        <div className="p-8">
          {ssoError && <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{ssoError}</div>}
          <LoginForm next={next} />
          {greatUrl && (
            <a href={greatUrl} className="mt-4 block w-full rounded-lg border border-gray-300 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Masuk lewat Great
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
