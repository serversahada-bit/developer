import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, BarChart3, Bug, CalendarDays, Clock, Coins, Hourglass, Info, Laptop, Lightbulb, Repeat, Server, Settings, ShieldCheck, Wrench } from "lucide-react";
import { canUseMenu, requireUser, type CurrentUser } from "@/lib/auth";
import { approvalRun, approvalSteps, canViewApproval } from "@/lib/approval";
import { checklistItems } from "@/lib/checklist";
import { db, row, rows, type Row } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { fpmDeadline } from "@/lib/deadlines";
import { approvalTable, detailOrigin, isDetailType, rupiah, type DetailType } from "@/lib/documents";
import { decodeScopeItems } from "@/lib/scope";
import { ChecklistPanel, ScopeItemList } from "@/components/ChecklistPanel";
import { DeadlineBadge, FpmCompletionBadge, Notice, StatusBadge } from "@/components/ui";
import ActionForm, { SubmitButton } from "@/components/ActionForm";
import ApprovalPanel from "./ApprovalPanel";
import { adjustDurationAction, fpmEstimateAction, fpmTransitionAction } from "../../actions";

export const metadata: Metadata = { title: "Detail Pengajuan" };

const NOTICES: Record<string, string> = {
  submitted: "Pengajuan dikirim ke tahap approval pertama.",
  resubmitted: "Revisi dikirim kembali. Approval dimulai lagi dari tahap pertama.",
};

function Card({ tone, icon: Icon, title, children }: { tone: "indigo" | "purple" | "emerald" | "gray"; icon: typeof Info; title: string; children: React.ReactNode }) {
  const header = { indigo: "bg-indigo-50 border-indigo-100 text-indigo-900", purple: "bg-purple-50 border-purple-100 text-purple-900", emerald: "bg-emerald-50 border-emerald-100 text-emerald-900", gray: "border-gray-100 text-gray-900" }[tone];
  const iconColor = { indigo: "text-indigo-600", purple: "text-purple-600", emerald: "text-emerald-600", gray: "text-gray-500" }[tone];
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className={`flex items-center gap-3 border-b px-6 py-4 ${header}`}>
        <Icon className={`h-5 w-5 ${iconColor}`} aria-hidden="true" />
        <h2 className="font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="info-label">{label}</div>
      <div className="info-value">{children}</div>
    </div>
  );
}

function Creator({ data }: { data: Row }) {
  if (data.creator_username === null) return null;
  return <div className="mt-1 text-xs text-gray-500">{data.creator_role} &middot; @{data.creator_username}</div>;
}

function DurationForm({ type, id, value, label, tone }: { type: "fpa" | "fpaa" | "fpm"; id: number; value: number | null; label: string; tone: "indigo" | "purple" }) {
  const isFpm = type === "fpm";
  return (
    <ActionForm action={isFpm ? fpmEstimateAction : adjustDurationAction} messagePosition="bottom" className="mt-2 border-t border-gray-100 pt-4">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="id" value={id} />
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor={`duration-${type}`} className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
          <input type="number" id={`duration-${type}`} name="duration_value" min={isFpm ? 1 : 0} max={isFpm ? 999 : 99999999} defaultValue={value ?? ""}
            placeholder={isFpm ? "Contoh: 3 — kosongkan untuk menghapus" : "Kosongkan untuk pakai estimasi pemohon"} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <SubmitButton className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${tone === "purple" ? "bg-purple-600 hover:bg-purple-700" : "bg-indigo-600 hover:bg-indigo-700"}`}>Simpan</SubmitButton>
      </div>
    </ActionForm>
  );
}

async function loadDocument(type: DetailType, id: number): Promise<Row | null> {
  if (type === "fpm") {
    return row(db, `SELECT s.*, u.username AS creator_username, u.role AS creator_role, e.full_name AS estimasi_oleh_name
      FROM fpm_submissions s LEFT JOIN users u ON u.id = s.created_by_user_id LEFT JOIN users e ON e.id = s.estimasi_diisi_oleh WHERE s.id = ?`, [id]);
  }
  return row(db, `SELECT d.*, u.username AS creator_username, u.role AS creator_role FROM ${approvalTable(type)} d
    LEFT JOIN users u ON u.id = d.created_by_user_id WHERE d.id = ?`, [id]);
}

function backLink(origin: string, type: DetailType, user: CurrentUser): string {
  if (origin === "tasks" && canUseMenu(user, "tasks")) return type === "fpm" ? "/tasks#fpm" : "/tasks";
  return canUseMenu(user, "approvals") ? `/approvals#${type}` : "/";
}

export default async function ApprovalDetailPage({ params, searchParams }: PageProps<"/approvals/[type]/[id]">) {
  const { type, id: rawId } = await params;
  const query = await searchParams;
  const user = await requireUser(`/approvals/${type}/${rawId}`);
  if (!isDetailType(type) || !/^[1-9][0-9]{0,9}$/.test(rawId)) notFound();
  const id = Number(rawId);
  const data = await loadDocument(type, id);
  if (!data) notFound();

  const run = type !== "fpm" ? await approvalRun(db, type, id) : null;
  // FPM reports are open to every signed-in account, as before; FPA/FPA-A only to the requester,
  // the approvers on its route, and Admin.
  if (type !== "fpm" && !(await canViewApproval(run, data, user))) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-gray-700">Anda tidak memiliki akses ke pengajuan ini.</p>
      </main>
    );
  }
  const steps = run ? await approvalSteps(db, run) : [];
  const events = run ? await rows(db, "SELECT * FROM approval_events WHERE run_id = ? ORDER BY id", [run.id]) : [];
  const checklist = type !== "fpm" && data.status_dokumen === "Disetujui" ? await checklistItems(type, id) : [];
  const canAdjustDuration = type !== "fpm" && user.role === "Admin" && run?.state === "pending";
  const canManageFpm = type === "fpm" && user.role === "Admin" && ["Open", "In Progress"].includes(data.status_dokumen);
  const origin = detailOrigin(query.from);
  const notice = typeof query.notice === "string" ? NOTICES[query.notice] : undefined;

  const title = { fpa: "Detail FPA", fpaa: "Detail FPA-A", fpm: "Detail FPM" }[type];
  const subtitle = type === "fpa" ? data.nomor_fpa : type === "fpaa" ? data.nomor_fpa_a || "Draft Adendum" : data.nama_sistem;

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href={backLink(origin, type, user)} aria-label="Kembali" className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
            <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
          </div>
        </div>
        <StatusBadge status={data.status_dokumen} size="md" />
      </header>

      <main className="mx-auto w-full max-w-5xl p-6">
        {notice && <Notice>{notice}</Notice>}
        {type !== "fpm" && <ApprovalPanel type={type} document={data} run={run} steps={steps} events={events} user={user} />}

        {type === "fpa" && (
          <div className="space-y-6">
            <Card tone="indigo" icon={Info} title="Informasi Umum">
              <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2 lg:grid-cols-4">
                <Field label="Pemohon">{data.nama_pemohon}<Creator data={data} /></Field>
                <Field label="Departemen">{data.departemen}</Field>
                <Field label="Disetujui Oleh (Head)">{data.nama_head}</Field>
                <Field label="Tanggal Pengajuan">{formatDate(data.tanggal_pengajuan, "d F Y")}</Field>
              </div>
            </Card>
            <Card tone="indigo" icon={Laptop} title="Kebutuhan Aplikasi">
              <div className="space-y-6 p-6">
                <div className="grid grid-cols-1 gap-6 border-b border-gray-100 pb-6 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <div className="info-label">Nama Aplikasi / Sistem</div>
                    <div className="text-lg font-bold text-gray-900">{data.nama_aplikasi}</div>
                  </div>
                  <Field label="Tingkat Urgensi">
                    <span className={`flex items-center gap-2 font-bold ${{ High: "text-red-600", Medium: "text-yellow-600", Low: "text-green-600" }[data.urgensi as string] ?? "text-gray-600"}`}>
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {data.urgensi}
                    </span>
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="info-box">
                    <div className="info-label mb-2 flex items-center gap-1"><Bug className="h-3 w-3" aria-hidden="true" /> Masalah Saat Ini</div>
                    <p className="whitespace-pre-line text-gray-700">{data.masalah}</p>
                  </div>
                  <div className="info-box">
                    <div className="info-label mb-2 flex items-center gap-1"><Lightbulb className="h-3 w-3" aria-hidden="true" /> Solusi yang Diharapkan</div>
                    <ScopeContent type="fpa" raw={data.solusi} checklist={checklist} data={data} user={user} />
                  </div>
                  <div className="info-box md:col-span-2">
                    <div className="info-label mb-2 flex items-center gap-1"><BarChart3 className="h-3 w-3" aria-hidden="true" /> Dampak Bisnis / Benefit</div>
                    <p className="whitespace-pre-line text-gray-700">{data.dampak_bisnis}</p>
                  </div>
                </div>
              </div>
            </Card>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card tone="indigo" icon={Settings} title="Rencana Eksekusi">
                <div className="space-y-4 p-6">
                  <Field label="Skala Aplikasi">{data.skala_aplikasi}</Field>
                  <Field label="Metode Eksekusi">{data.metode_eksekusi}</Field>
                  <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-4">
                    <div>
                      <div className="info-label">Estimasi Durasi</div>
                      <div className="info-value text-xl font-bold">{data.estimasi_durasi || "-"} <span className="text-sm font-normal text-gray-500">Hari</span></div>
                      {data.estimasi_durasi_admin !== null && (
                        <div className="mt-1 flex items-center gap-1 text-sm font-semibold text-indigo-700"><ShieldCheck className="h-3 w-3" aria-hidden="true" />Koreksi Admin: {data.estimasi_durasi_admin} Hari</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="info-label">Estimasi Biaya</div>
                      <div className="info-value text-xl font-bold text-green-600">{Number(data.estimasi_biaya) ? rupiah(data.estimasi_biaya) : "Gratis / Internal"}</div>
                      <div className="text-xs text-gray-500">{data.status_biaya}</div>
                      {data.estimasi_biaya_admin !== null && (
                        <div className="mt-1 flex items-center justify-end gap-1 text-sm font-semibold text-indigo-700"><ShieldCheck className="h-3 w-3" aria-hidden="true" />Koreksi budget: {rupiah(data.estimasi_biaya_admin)}</div>
                      )}
                    </div>
                  </div>
                  {canAdjustDuration && <DurationForm type="fpa" id={id} value={data.estimasi_durasi_admin} label="Koreksi estimasi hari (Admin)" tone="indigo" />}
                </div>
              </Card>
              <Card tone="indigo" icon={Server} title="Catatan Teknis IT">
                <div className="space-y-4 p-6 text-sm">
                  <Field label="Server & Hosting">{data.catatan_teknis_server || "-"}</Field>
                  <Field label="Lisensi & Keamanan">{data.catatan_teknis_lisensi || "-"}</Field>
                  <Field label="Integrasi (API/Database)">{data.catatan_teknis_integrasi || "-"}</Field>
                  <Field label="Hardware Tambahan">{data.catatan_teknis_hardware || "-"}</Field>
                </div>
              </Card>
            </div>
          </div>
        )}

        {type === "fpaa" && (
          <div className="space-y-6">
            <Card tone="purple" icon={Info} title="Informasi Proyek">
              <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2 lg:grid-cols-4">
                <Field label="Nama Proyek / Aplikasi" className="md:col-span-2"><span className="text-lg">{data.nama_proyek}</span></Field>
                <Field label="Nomor FPA Utama">{data.nomor_fpa_utama || "-"}</Field>
                <Field label="Tanggal Pengajuan">{formatDate(data.created_at, "d F Y")}</Field>
                <Field label="Pemohon">{data.user_nama}<Creator data={data} /></Field>
                <Field label="Departemen">{data.departemen}</Field>
              </div>
            </Card>
            <Card tone="purple" icon={Repeat} title="Detail Perubahan (Adendum)">
              <div className="space-y-6 p-6">
                <div>
                  <div className="info-label mb-2">Kategori Perubahan</div>
                  <div className="flex flex-wrap gap-2">
                    {String(data.jenis_perubahan ?? "").split(", ").filter(Boolean).map((j) => (
                      <span key={j} className="rounded-lg border border-gray-200 bg-gray-100 px-3 py-1 text-sm text-gray-700">{j}</span>
                    ))}
                  </div>
                </div>
                <div className="info-box">
                  <div className="info-label mb-2">Deskripsi Perubahan / Fitur &amp; Scope</div>
                  <ScopeContent type="fpaa" raw={data.deskripsi_perubahan} checklist={checklist} data={data} user={user} />
                </div>
                <div className="grid grid-cols-1 gap-6 border-t border-gray-100 pt-6 md:grid-cols-2">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600"><Clock className="h-5 w-5" aria-hidden="true" /></div>
                    <div>
                      <div className="info-label">Tambahan Waktu (Hari)</div>
                      <div className="text-xl font-bold text-gray-900">{data.tambahan_waktu ? `${data.tambahan_waktu} Hari` : "-"}</div>
                      {data.tambahan_waktu_admin !== null && (
                        <div className="mt-1 flex items-center gap-1 text-sm font-semibold text-purple-700"><ShieldCheck className="h-3 w-3" aria-hidden="true" />Koreksi Admin: {data.tambahan_waktu_admin} Hari</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600"><Coins className="h-5 w-5" aria-hidden="true" /></div>
                    <div>
                      <div className="info-label">Tambahan Biaya</div>
                      <div className="text-xl font-bold text-gray-900">{Number(data.tambahan_biaya) ? rupiah(data.tambahan_biaya) : "-"}</div>
                      {data.tambahan_biaya_admin !== null && (
                        <div className="mt-1 flex items-center gap-1 text-sm font-semibold text-purple-700"><ShieldCheck className="h-3 w-3" aria-hidden="true" />Koreksi budget: {rupiah(data.tambahan_biaya_admin)}</div>
                      )}
                    </div>
                  </div>
                </div>
                {canAdjustDuration && <DurationForm type="fpaa" id={id} value={data.tambahan_waktu_admin} label="Koreksi tambahan waktu (Admin)" tone="purple" />}
              </div>
            </Card>
          </div>
        )}

        {type === "fpm" && (
          <div className="space-y-6">
            <Card tone="emerald" icon={Wrench} title="Detail Laporan Kendala">
              <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2 lg:grid-cols-3">
                <Field label="Sistem / Aplikasi" className="md:col-span-2 lg:col-span-1"><span className="text-lg font-bold">{data.nama_sistem}</span></Field>
                <Field label="Pelapor">{data.nama_pelapor}<Creator data={data} /></Field>
                <Field label="Tanggal Kejadian"><span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-gray-400" aria-hidden="true" />{formatDate(data.tanggal_kejadian, "d F Y")}</span></Field>
              </div>
              <div className="border-t border-gray-100 p-6">
                <div className="info-label mb-2">Jenis Kendala</div>
                <div className="mb-6 flex flex-wrap gap-2">
                  {String(data.jenis_kendala ?? "").split(", ").filter(Boolean).map((k) => (
                    <span key={k} className="rounded-lg border border-red-100 bg-red-50 px-3 py-1 text-sm text-red-700">{k}</span>
                  ))}
                </div>
                <div className="info-box border-red-100 bg-red-50">
                  <div className="info-label mb-2 flex items-center gap-1 text-red-800"><AlertTriangle className="h-3 w-3" aria-hidden="true" /> Deskripsi Kendala / Error</div>
                  <p className="whitespace-pre-line text-red-900">{data.deskripsi_kendala}</p>
                </div>
              </div>
            </Card>
            <Card tone="gray" icon={Hourglass} title="Estimasi Durasi Pengerjaan">
              <div className="space-y-4 p-6">
                <FpmEstimate data={data} />
                {canManageFpm && <DurationForm type="fpm" id={id} value={data.estimasi_durasi} label="Estimasi Durasi Pengerjaan (hari)" tone="indigo" />}
              </div>
            </Card>
            {canManageFpm && (
              <ActionForm action={fpmTransitionAction} className="rounded-xl border p-5">
                <input type="hidden" name="id" value={id} />
                <SubmitButton name="action" value={data.status_dokumen === "Open" ? "process" : "close"} className="rounded-lg bg-indigo-600 px-5 py-2.5 text-white disabled:opacity-60">
                  {data.status_dokumen === "Open" ? "Tandai Diproses" : "Selesaikan Laporan"}
                </SubmitButton>
              </ActionForm>
            )}
          </div>
        )}
      </main>
    </>
  );
}

function ScopeContent({ type, raw, checklist, data, user }: { type: "fpa" | "fpaa"; raw: string | null; checklist: Awaited<ReturnType<typeof checklistItems>>; data: Row; user: CurrentUser }) {
  if (checklist.length) return <ChecklistPanel items={checklist} type={type} createdBy={data.created_by_user_id} user={user} />;
  const items = decodeScopeItems(raw, type === "fpa" ? "fpa_solusi_list" : "fpaa_scope_list");
  if (items) return <ScopeItemList items={items} />;
  return <p className="whitespace-pre-line text-gray-700">{raw}</p>;
}

function FpmEstimate({ data }: { data: Row }) {
  const deadline = fpmDeadline(data as Parameters<typeof fpmDeadline>[0]);
  return (
    <div>
      {data.estimasi_durasi !== null ? (
        <>
          <div className="info-value text-xl font-bold">{data.estimasi_durasi} <span className="text-sm font-normal text-gray-500">Hari</span></div>
          {data.estimasi_oleh_name && data.estimasi_diisi_at && (
            <div className="mt-1 text-xs text-gray-500">Diisi oleh {data.estimasi_oleh_name} &middot; {formatDate(data.estimasi_diisi_at, "d M Y H:i")}</div>
          )}
          {deadline ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-700">
              Deadline <span className="font-semibold">{formatDate(deadline, "d F Y")}</span>
              {data.status_dokumen === "In Progress" && <DeadlineBadge deadline={deadline} />}
            </div>
          ) : data.status_dokumen === "Open" ? (
            <div className="mt-2 text-xs text-gray-400">Deadline dihitung sejak laporan ditandai diproses.</div>
          ) : null}
        </>
      ) : (
        <div className="text-sm text-gray-500">Belum diisi oleh Developer.</div>
      )}
      {data.status_dokumen === "Closed" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-sm text-gray-700">
          {data.tanggal_selesai ? (
            <>Diselesaikan <span className="font-semibold">{formatDate(data.tanggal_selesai, "d F Y")}</span> <FpmCompletionBadge fpm={data as Parameters<typeof FpmCompletionBadge>[0]["fpm"]} /></>
          ) : (
            <span className="text-gray-400">Tanggal selesai tidak tercatat.</span>
          )}
        </div>
      )}
    </div>
  );
}
