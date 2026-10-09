import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Eye, Flag, GitBranch, History, Hourglass, User } from "lucide-react";
import { canUseMenu, requireUser, type CurrentUser } from "@/lib/auth";
import { approvalList } from "@/lib/approval";
import { checklistItems, checklistProgress, type ChecklistItem } from "@/lib/checklist";
import { db, rows, type Row } from "@/lib/db";
import { daysUntil, formatDate } from "@/lib/dates";
import { computeTaskDeadline, fpmDeadline } from "@/lib/deadlines";
import { detailUrl, type DocType } from "@/lib/documents";
import { ChecklistPanel } from "@/components/ChecklistPanel";
import { AccessDenied, ConfidentialBadge, DeadlineBadge, EmptyState, FpmCompletionBadge, PageHeader, UrgencyBadge } from "@/components/ui";
import Tabs from "@/components/Tabs";

export const metadata: Metadata = { title: "Task" };

// Documents still running (not rejected or draft).
const ACTIVE_STATUSES = ["Diajukan", "Diverifikasi", "Disetujui", "Revisi"];

interface Task {
  type: DocType;
  typeLabel: string;
  number: string;
  title: string;
  requester: string;
  department: string;
  status: string;
  approvalLabel: string;
  parentNumber: string | null;
  extensionDays: number;
  extensionSources: string[];
  deadline: string | null;
  daysRemaining: number | null;
  createdAt: string;
  detailUrl: string;
  restricted: boolean;
  document: Row;
  checklist: ChecklistItem[];
  checklistDone: number;
  checklistTotal: number;
  children: Task[];
}

function sortByDeadline(list: Task[]) {
  list.sort((a, b) => {
    if (a.deadline === null && b.deadline === null) return b.createdAt.localeCompare(a.createdAt);
    if (a.deadline === null) return 1;
    if (b.deadline === null) return -1;
    return a.deadline.localeCompare(b.deadline);
  });
}

async function loadTasks(user: CurrentUser): Promise<Task[]> {
  // Approved addenda push out their parent FPA's deadline by their own extra time.
  const extensionDays = new Map<string, number>();
  const extensionSources = new Map<string, string[]>();
  const extensions = await rows(db, `SELECT nomor_fpa_utama, nomor_fpa_a, COALESCE(tambahan_waktu_admin, tambahan_waktu) AS effective_waktu FROM fpa_a_submissions
    WHERE status_dokumen = 'Disetujui' AND nomor_fpa_utama IS NOT NULL AND COALESCE(tambahan_waktu_admin, tambahan_waktu) > 0`);
  for (const ext of extensions) {
    const days = Number(ext.effective_waktu);
    extensionDays.set(ext.nomor_fpa_utama, (extensionDays.get(ext.nomor_fpa_utama) ?? 0) + days);
    extensionSources.set(ext.nomor_fpa_utama, [...(extensionSources.get(ext.nomor_fpa_utama) ?? []), `${ext.nomor_fpa_a} (+${days} hari)`]);
  }

  // A document marked "rahasia" stays visible on the board, but only its owner, an approver on its
  // route, or an Admin see anything past the number/date/deadline.
  const approverDocs = new Set(
    (await rows(db, "SELECT r.document_type, r.document_id FROM approval_runs r JOIN approval_steps s ON s.run_id = r.id WHERE s.approver_id = ?", [user.id]))
      .map((r) => `${r.document_type}:${r.document_id}`),
  );
  const canSeeConfidential = (document: Row, type: DocType) =>
    user.role === "Admin" || Number(document.created_by_user_id ?? 0) === user.id || approverDocs.has(`${type}:${document.id}`);

  // FPA-A has no "rahasia" flag of its own; it inherits its parent FPA's, looked up by nomor_fpa.
  const fpaRahasia = new Map((await rows(db, "SELECT nomor_fpa, rahasia FROM fpa_submissions")).map((r) => [r.nomor_fpa, Boolean(r.rahasia)]));

  const decorate = async (task: Omit<Task, "daysRemaining" | "checklist" | "checklistDone" | "checklistTotal">): Promise<Task> => {
    const checklist = !task.restricted && task.status === "Disetujui" ? await checklistItems(task.type, Number(task.document.id)) : [];
    const [done, total] = checklistProgress(checklist);
    return { ...task, daysRemaining: task.deadline ? daysUntil(task.deadline) : null, checklist, checklistDone: done, checklistTotal: total };
  };

  const tasks: Task[] = [];
  const fpaIndex = new Map<string, Task>();
  for (const doc of await approvalList("fpa", user, "board")) {
    if (!ACTIVE_STATUSES.includes(doc.status_dokumen)) continue;
    const extra = extensionDays.get(doc.nomor_fpa) ?? 0;
    const duration = doc.estimasi_durasi_admin ?? doc.estimasi_durasi;
    const total = duration !== null && duration !== "" ? Number(duration) + extra : duration;
    const task = await decorate({
      type: "fpa", typeLabel: "FPA", number: doc.nomor_fpa, title: doc.nama_aplikasi, requester: doc.nama_pemohon, department: doc.departemen,
      status: doc.status_dokumen, approvalLabel: doc.approval_label, parentNumber: null, extensionDays: extra,
      extensionSources: extensionSources.get(doc.nomor_fpa) ?? [], deadline: computeTaskDeadline(doc.tanggal_pengajuan, total),
      createdAt: doc.created_at, detailUrl: detailUrl("fpa", Number(doc.id), "tasks"),
      restricted: Boolean(doc.rahasia) && !canSeeConfidential(doc, "fpa"), document: doc, children: [],
    });
    tasks.push(task);
    fpaIndex.set(doc.nomor_fpa, task);
  }

  // Addenda nest under their parent FPA's card when a match is found; orphaned references
  // (parent not in this active list, or a mistyped nomor_fpa_utama) stay as standalone cards.
  for (const doc of await approvalList("fpaa", user, "board")) {
    if (!ACTIVE_STATUSES.includes(doc.status_dokumen)) continue;
    const waktu = doc.tambahan_waktu_admin ?? doc.tambahan_waktu;
    const task = await decorate({
      type: "fpaa", typeLabel: "FPA-A", number: doc.nomor_fpa_a || "Draft", title: doc.nama_proyek, requester: doc.user_nama, department: doc.departemen,
      status: doc.status_dokumen, approvalLabel: doc.approval_label, parentNumber: doc.nomor_fpa_utama, extensionDays: 0, extensionSources: [],
      deadline: computeTaskDeadline(doc.created_at ? doc.created_at.slice(0, 10) : null, waktu), createdAt: doc.created_at,
      detailUrl: detailUrl("fpaa", Number(doc.id), "tasks"),
      restricted: (fpaRahasia.get(doc.nomor_fpa_utama) ?? false) && !canSeeConfidential(doc, "fpaa"), document: doc, children: [],
    });
    const parent = doc.nomor_fpa_utama !== null ? fpaIndex.get(doc.nomor_fpa_utama) : undefined;
    if (parent) parent.children.push(task);
    else tasks.push(task);
  }

  // Top-level order follows each FPA's own deadline; nested FPA-A no longer compete for position.
  sortByDeadline(tasks);
  for (const task of tasks) sortByDeadline(task.children);
  return tasks;
}

function TaskCard({ task, user, nested = false }: { task: Task; user: CurrentUser; nested?: boolean }) {
  if (task.restricted) {
    return (
      <div className={`overflow-hidden rounded-xl border border-l-4 border-gray-200 border-l-gray-300 bg-white ${nested ? "" : "shadow-sm"}`}>
        <div className="flex flex-col justify-between gap-4 bg-gray-50 p-4 sm:p-5 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">{task.typeLabel}</span>
              <span className="text-sm font-bold text-gray-900">{task.number}</span>
              <ConfidentialBadge />
            </div>
            <p className="mt-2 text-xs text-gray-400">Dibuat {formatDate(task.createdAt, "d M Y")} &middot; detail hanya terlihat oleh pemohon, approver di jalurnya, dan Admin</p>
          </div>
          <div className="shrink-0 text-left lg:text-right">
            <div className="text-sm font-semibold text-gray-700">{task.deadline ? formatDate(task.deadline, "d M Y") : "-"}</div>
            <div className="mt-1"><UrgencyBadge daysRemaining={task.daysRemaining} /></div>
          </div>
        </div>
      </div>
    );
  }
  const isFpa = task.type === "fpa";
  return (
    <div className={`overflow-hidden rounded-xl border border-l-4 border-gray-200 bg-white ${isFpa ? "border-l-indigo-500" : "border-l-purple-500"} ${nested ? "" : "shadow-sm"}`}>
      <div className={`flex flex-col justify-between gap-4 p-4 sm:p-5 lg:flex-row lg:items-start ${isFpa ? "bg-indigo-50/40" : "bg-purple-50/40"}`}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md border px-2.5 py-1 text-xs font-bold ${isFpa ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-purple-200 bg-purple-50 text-purple-700"}`}>{task.typeLabel}</span>
            <span className="text-sm font-bold text-gray-900">{task.number}</span>
            <TaskStatusBadge status={task.status} />
          </div>
          <div className="mt-1.5 text-sm font-medium text-gray-800">{task.title}</div>
          {!nested && task.type === "fpaa" && task.parentNumber && (
            <div className="mt-1 flex items-center gap-1 text-xs text-amber-700">
              <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
              Referensi ke <span className="font-semibold">{task.parentNumber}</span> &mdash; FPA tersebut tidak ada di daftar Task aktif ini
            </div>
          )}
          <div className="mt-1 text-xs text-gray-400">{task.approvalLabel}</div>
          <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
            <User className="h-2.5 w-2.5 opacity-60" aria-hidden="true" />{task.requester}<span className="mx-1 text-gray-300">&middot;</span>{task.department}
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-4 lg:justify-end">
          <div className="text-left lg:text-right">
            <div className="text-sm font-semibold text-gray-700">{task.deadline ? formatDate(task.deadline, "d M Y") : "-"}</div>
            <div className="mt-1"><UrgencyBadge daysRemaining={task.daysRemaining} /></div>
            {task.extensionDays > 0 && (
              <div className="mt-1 flex items-center gap-1 text-[10px] text-purple-600 lg:justify-end" title={task.extensionSources.join(", ")}>
                <History className="h-2.5 w-2.5" aria-hidden="true" />+{task.extensionDays} hari dari FPA-A
              </div>
            )}
            {task.checklistTotal > 0 && <div className="mt-1 text-[10px] text-gray-500">{task.checklistDone}/{task.checklistTotal} item ditest</div>}
          </div>
          <DetailLink href={task.detailUrl} />
        </div>
      </div>
      {task.checklist.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50 p-4 sm:p-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{isFpa ? "Solusi yang Diinginkan" : "Fitur/Scope"}</div>
          <ChecklistPanel items={task.checklist} type={task.type} createdBy={task.document.created_by_user_id} user={user} />
        </div>
      )}
      {task.children.length > 0 && (
        <div className="space-y-3 border-t border-gray-100 bg-purple-50/30 p-4 sm:p-5">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-purple-700">
            <GitBranch className="h-2.5 w-2.5" aria-hidden="true" /> Addendum (FPA-A) &middot; {task.children.length}
          </div>
          {task.children.map((child) => <TaskCard key={child.detailUrl} task={child} user={user} nested />)}
        </div>
      )}
    </div>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  const style = { Diajukan: "bg-yellow-100 text-yellow-800", Diverifikasi: "bg-blue-100 text-blue-800", Disetujui: "bg-green-100 text-green-800", Revisi: "bg-purple-100 text-purple-800", Open: "bg-yellow-100 text-yellow-800", "In Progress": "bg-blue-100 text-blue-800", Closed: "bg-green-100 text-green-800" }[status] ?? "bg-gray-100 text-gray-800";
  return <span className={`inline-flex rounded-full px-2 text-[10px] font-semibold leading-5 ${style}`}>{status}</span>;
}

function DetailLink({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-100 bg-white px-3 py-1.5 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-900">
      <Eye className="h-3 w-3" aria-hidden="true" /> Detail
    </Link>
  );
}

function FpmCard({ fpm }: { fpm: Row }) {
  const closed = fpm.status_dokumen === "Closed";
  const deadline = fpmDeadline(fpm as Parameters<typeof fpmDeadline>[0]);
  return (
    <div className={`overflow-hidden rounded-xl border border-l-4 border-gray-200 bg-white ${closed ? "border-l-emerald-300 opacity-75" : "border-l-emerald-500 shadow-sm"}`}>
      <div className={`flex flex-col justify-between gap-4 p-4 sm:p-5 lg:flex-row lg:items-start ${closed ? "bg-gray-50" : "bg-emerald-50/40"}`}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">FPM</span>
            <TaskStatusBadge status={fpm.status_dokumen} />
          </div>
          <div className="mt-1.5 text-sm font-medium text-gray-800">{fpm.nama_sistem}</div>
          <div className="mt-1 text-xs text-gray-500">{fpm.jenis_kendala}</div>
          <div className="mt-2 flex items-center gap-1 text-xs text-gray-500"><User className="h-2.5 w-2.5 opacity-60" aria-hidden="true" />{fpm.nama_pelapor}</div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-4 lg:justify-end">
          <div className="text-left lg:text-right">
            <div className="text-sm font-semibold text-gray-700">{formatDate(fpm.created_at, "d M Y")}</div>
            <div className="mt-1 text-[10px] text-gray-400">Tanggal lapor</div>
            {closed ? (
              <>
                {fpm.tanggal_selesai ? (
                  <div className="mt-2 flex items-center gap-1 text-xs font-medium text-gray-700 lg:justify-end"><Flag className="h-2.5 w-2.5 opacity-60" aria-hidden="true" />Selesai {formatDate(fpm.tanggal_selesai, "d M Y")}</div>
                ) : (
                  <div className="mt-2 text-[11px] text-gray-400">Tanggal selesai tidak tercatat</div>
                )}
                {fpm.estimasi_durasi !== null && <div className="mt-1 text-[11px] text-gray-500">Estimasi {fpm.estimasi_durasi} hari</div>}
                <div className="mt-1"><FpmCompletionBadge fpm={fpm as Parameters<typeof FpmCompletionBadge>[0]["fpm"]} /></div>
              </>
            ) : fpm.estimasi_durasi !== null ? (
              <>
                <div className="mt-2 flex items-center gap-1 text-xs font-medium text-gray-700 lg:justify-end"><Hourglass className="h-2.5 w-2.5 opacity-60" aria-hidden="true" />Estimasi {fpm.estimasi_durasi} hari</div>
                {deadline ? (
                  <>
                    <div className="mt-1 text-[11px] text-gray-500">Deadline {formatDate(deadline, "d M Y")}</div>
                    <div className="mt-1"><DeadlineBadge deadline={deadline} /></div>
                  </>
                ) : fpm.status_dokumen === "Open" ? (
                  <div className="mt-1 text-[10px] text-gray-400">Deadline dihitung sejak diproses</div>
                ) : null}
              </>
            ) : null}
          </div>
          <DetailLink href={detailUrl("fpm", Number(fpm.id), "tasks")} />
        </div>
      </div>
    </div>
  );
}

export default async function TasksPage() {
  const user = await requireUser("/tasks");
  if (!canUseMenu(user, "tasks")) return <AccessDenied user={user} />;

  const [tasks, fpmActive, fpmHistory] = await Promise.all([
    loadTasks(user),
    rows(db, "SELECT * FROM fpm_submissions WHERE status_dokumen IN ('Open', 'In Progress') ORDER BY created_at DESC"),
    // Closed reports stay listed as history, most recently finished first (older ones without a close date last).
    rows(db, "SELECT * FROM fpm_submissions WHERE status_dokumen = 'Closed' ORDER BY tanggal_selesai IS NULL, tanggal_selesai DESC, created_at DESC"),
  ]);
  const taskCount = tasks.reduce((sum, task) => sum + 1 + task.children.length, 0);

  return (
    <>
      <PageHeader crumbs={["IT PSLU"]} title="Task" />
      <div className="flex-1 p-6 lg:p-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Task</h2>
            <p className="mt-1 text-sm text-gray-500">Pengajuan yang masih berjalan, diurutkan dari deadline paling dekat</p>
          </div>
          <Tabs label="Kategori task" variant="compact" tabs={[
            {
              id: "fpafpaa",
              label: <>FPA &amp; FPA-A <span className="ml-1.5 rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{taskCount}</span></>,
              panel: tasks.length === 0 ? (
                <EmptyState><CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-300" aria-hidden="true" />Tidak ada task FPA/FPA-A yang sedang berjalan.</EmptyState>
              ) : (
                <div className="space-y-4">{tasks.map((task) => <TaskCard key={task.detailUrl} task={task} user={user} />)}</div>
              ),
            },
            {
              id: "fpm",
              label: <>FPM <span className="ml-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">{fpmActive.length}</span></>,
              panel: (
                <>
                  {fpmActive.length === 0 ? (
                    <EmptyState><CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-300" aria-hidden="true" />Tidak ada laporan FPM yang sedang berjalan.</EmptyState>
                  ) : (
                    <div className="space-y-3">{fpmActive.map((fpm) => <FpmCard key={fpm.id} fpm={fpm} />)}</div>
                  )}
                  {fpmHistory.length > 0 && (
                    <details className="group mt-8">
                      <summary className="flex cursor-pointer select-none list-none items-center gap-2 border-b border-gray-200 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 [&::-webkit-details-marker]:hidden">
                        <ChevronRight className="h-3 w-3 text-gray-400 transition-transform group-open:rotate-90" aria-hidden="true" />
                        Riwayat &middot; Sudah Selesai
                        <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{fpmHistory.length}</span>
                      </summary>
                      <div className="mt-4 space-y-3">{fpmHistory.map((fpm) => <FpmCard key={fpm.id} fpm={fpm} />)}</div>
                    </details>
                  )}
                </>
              ),
            },
          ]} />
        </div>
      </div>
    </>
  );
}
