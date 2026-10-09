import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FileSignature, FileText, Headset, Wrench } from "lucide-react";
import { canUseMenu, requireUser } from "@/lib/auth";
import { AccessDenied } from "@/components/ui";

export const metadata: Metadata = { title: "Portal Pengajuan Layanan IT" };

const FORMS = [
  { href: "/pengajuan/fpa", icon: FileText, name: "FPA", subtitle: "Pengajuan Aplikasi Baru", tone: "indigo",
    text: "Gunakan formulir ini untuk mengajukan pembuatan atau pembelian aplikasi / sistem IT yang baru dari awal. Login diperlukan; identitas pemohon otomatis mengikuti akun Anda." },
  { href: "/pengajuan/fpa-a", icon: FileSignature, name: "FPA-A", subtitle: "Adendum (Perubahan)", tone: "purple",
    text: "Gunakan formulir ini jika Anda ingin mengajukan perubahan ruang lingkup, jadwal, atau anggaran pada FPA yang sudah berjalan." },
  { href: "/pengajuan/fpm", icon: Wrench, name: "FPM", subtitle: "Permintaan Maintenance", tone: "emerald",
    text: "Gunakan formulir ini untuk melaporkan adanya error (bug), gangguan performa, atau permintaan perbaikan rutin pada aplikasi." },
] as const;

const TONES = {
  indigo: { corner: "bg-indigo-50", icon: "bg-indigo-100 text-indigo-600", text: "text-indigo-600" },
  purple: { corner: "bg-purple-50", icon: "bg-purple-100 text-purple-600", text: "text-purple-600" },
  emerald: { corner: "bg-emerald-50", icon: "bg-emerald-100 text-emerald-600", text: "text-emerald-600" },
};

export default async function PengajuanPage() {
  const user = await requireUser("/pengajuan");
  if (!canUseMenu(user, "pengajuan")) return <AccessDenied user={user} />;
  return (
    <div className="flex min-h-[calc(100vh-2rem)] flex-col items-center justify-center p-6">
      <div className="w-full max-w-5xl">
        <div className="mb-12 text-center">
          <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200"><Headset className="h-9 w-9" aria-hidden="true" /></div>
          <h1 className="mb-4 text-3xl font-bold text-gray-900 md:text-4xl">Portal Layanan IT</h1>
          <p className="mx-auto max-w-2xl text-gray-600">Silakan pilih formulir layanan IT yang sesuai dengan kebutuhan Anda. Pastikan untuk mengisi data dengan lengkap dan valid.</p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {FORMS.map(({ href, icon: Icon, name, subtitle, tone, text }) => (
            <Link key={href} href={href} className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white p-8 transition duration-300 hover:-translate-y-1 hover:shadow-xl">
              <div className={`absolute right-0 top-0 h-24 w-24 rounded-bl-full transition-transform group-hover:scale-125 ${TONES[tone].corner}`} />
              <div className={`relative mb-6 flex h-12 w-12 items-center justify-center rounded-xl shadow-sm ${TONES[tone].icon}`}><Icon className="h-5 w-5" aria-hidden="true" /></div>
              <h2 className="mb-2 text-xl font-bold text-gray-900">{name}</h2>
              <h3 className={`mb-4 text-sm font-semibold ${TONES[tone].text}`}>{subtitle}</h3>
              <p className="mb-8 flex-grow text-sm text-gray-500">{text}</p>
              <div className={`mt-auto flex items-center text-sm font-semibold ${TONES[tone].text}`}>
                Isi Formulir <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Dashboard Tim IT
          </Link>
        </div>
      </div>
    </div>
  );
}
