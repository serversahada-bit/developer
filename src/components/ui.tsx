import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Lock } from "lucide-react";
import { daysLeftUntil, daysUntil, formatDate, parseWib, wibDateTime } from "@/lib/dates";
import { fpmLateDays } from "@/lib/deadlines";
import { userHomeMenu, type CurrentUser } from "@/lib/auth";

// Presentational pieces shared by several pages (server components).

export function PageHeader({ crumbs, title, children }: { crumbs?: string[]; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-4 border-b border-gray-200 bg-white px-6 py-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2 text-sm">
        {crumbs?.map((crumb) => (
          <span key={crumb} className="flex items-center gap-2">
            <span className="font-medium text-gray-500">{crumb}</span>
            <span className="text-gray-400">/</span>
          </span>
        ))}
        <h1 className="font-bold text-gray-900">{title}</h1>
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "success", children }: { tone?: "success" | "error" | "warning"; children: ReactNode }) {
  const styles = {
    success: "border-green-200 bg-green-50 text-green-800",
    error: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`mb-5 rounded-lg border p-4 text-sm ${styles}`}>
      {children}
    </div>
  );
}

const DOCUMENT_STATUS: Record<string, string> = {
  disetujui: "bg-green-100 text-green-800 border-green-200",
  closed: "bg-green-100 text-green-800 border-green-200",
  ditolak: "bg-red-100 text-red-800 border-red-200",
  diajukan: "bg-yellow-100 text-yellow-800 border-yellow-200",
  open: "bg-yellow-100 text-yellow-800 border-yellow-200",
  "in progress": "bg-blue-100 text-blue-800 border-blue-200",
  diverifikasi: "bg-blue-100 text-blue-800 border-blue-200",
  revisi: "bg-purple-100 text-purple-800 border-purple-200",
};

export function StatusBadge({ status, size = "sm" }: { status: string | null; size?: "xs" | "sm" | "md" }) {
  const sizing = { xs: "px-2 text-[10px] leading-5", sm: "px-2 text-xs leading-5", md: "px-3 py-1 text-sm leading-5" }[size];
  const color = DOCUMENT_STATUS[(status ?? "").toLowerCase()] ?? "bg-gray-100 text-gray-800 border-gray-200";
  return <span className={`inline-flex rounded-full border font-semibold ${sizing} ${color}`}>{status}</span>;
}

// Badge for a deadline: H-N left, due today, or N days late. Shared by the Task board and detail pages.
export function UrgencyBadge({ daysRemaining }: { daysRemaining: number | null }) {
  const base = "rounded border px-2 py-0.5 text-[10px] font-semibold";
  if (daysRemaining === null) return <span className={`${base} border-gray-200 bg-gray-100 text-gray-500`}>Tanpa deadline</span>;
  if (daysRemaining < 0) {
    return (
      <span className={`${base} inline-flex items-center gap-1 border-red-200 bg-red-50 text-red-700`}>
        <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
        Terlambat {Math.abs(daysRemaining)} hari
      </span>
    );
  }
  if (daysRemaining === 0) return <span className={`${base} border-orange-200 bg-orange-50 text-orange-700`}>Jatuh tempo hari ini</span>;
  if (daysRemaining <= 3) return <span className={`${base} border-orange-100 bg-orange-50 text-orange-700`}>H-{daysRemaining}</span>;
  return <span className={`${base} border-emerald-100 bg-emerald-50 text-emerald-700`}>H-{daysRemaining}</span>;
}

export function DeadlineBadge({ deadline }: { deadline: string | null }) {
  return <UrgencyBadge daysRemaining={deadline ? daysUntil(deadline) : null} />;
}

// Closed FPM: finished on time or N days late; nothing when there was no deadline to compare.
export function FpmCompletionBadge({ fpm }: { fpm: { estimasi_durasi: number | null; diproses_at: string | null; tanggal_selesai: string | null } }) {
  const lateDays = fpmLateDays(fpm);
  if (lateDays === null) return null;
  if (lateDays > 0) return <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">Terlambat {lateDays} hari</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
      <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
      Tepat waktu
    </span>
  );
}

// How much of the 7-day review window (since Dev marked an item done) remains.
export function ChecklistDeadlineBadge({ devDoneAt }: { devDoneAt: string }) {
  const deadline = parseWib(devDoneAt) + 7 * 86_400_000;
  const daysLeft = daysLeftUntil(deadline);
  const label = formatDate(wibDateTime(deadline), "d M Y H:i");
  let text: string;
  let style: string;
  if (daysLeft <= 0) {
    text = "Batas test terlewati";
    style = "border-red-200 bg-red-50 text-red-700";
  } else if (daysLeft === 1) {
    text = "Batas test hari ini";
    style = "border-orange-200 bg-orange-50 text-orange-700";
  } else {
    text = `Batas test H-${daysLeft}`;
    style = daysLeft <= 2 ? "border-orange-200 bg-orange-50 text-orange-700" : "border-blue-200 bg-blue-50 text-blue-700";
  }
  return (
    <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${style}`} title={`Batas hingga ${label}`}>
      {text}
    </span>
  );
}

export function ConfidentialBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
      <Lock className="h-2.5 w-2.5" aria-hidden="true" />
      Rahasia
    </span>
  );
}

// Shown in place of a page whose menu the account was not granted.
export function AccessDenied({ user }: { user: CurrentUser }) {
  const home = userHomeMenu(user);
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Akses dibatasi</h1>
        <p className="mt-3 text-sm text-gray-600">
          {home ? "Anda tidak memiliki akses ke menu ini. Hubungi Admin jika Anda memerlukannya." : "Akun Anda belum diberi akses menu. Hubungi Admin untuk mengaturnya melalui menu Users."}
        </p>
        {home && (
          <Link href={home.href} className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
            Buka {home.label}
          </Link>
        )}
      </div>
    </main>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500 shadow-sm">{children}</div>;
}
