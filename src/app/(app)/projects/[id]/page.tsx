import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Box, CalendarDays, Check, List, Plus, Trash2 } from "lucide-react";
import { canUseMenu, requireUser } from "@/lib/auth";
import { db, row, rows } from "@/lib/db";
import { formatDate, todayWib } from "@/lib/dates";
import { progressOf, projectNames, type DailyLog, type Project } from "@/lib/logs";
import { AccessDenied } from "@/components/ui";
import ActionForm, { SubmitButton } from "@/components/ActionForm";
import { deleteLogAction, saveLogAction, setLogStatusAction } from "../../log-actions";

export const metadata: Metadata = { title: "Detail Project" };

export default async function ProjectDetailPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/projects/${id}`);
  if (!canUseMenu(user, "projects")) return <AccessDenied user={user} />;
  if (!/^[1-9][0-9]{0,9}$/.test(id)) notFound();

  const project = await row<Project>(db, "SELECT * FROM projects WHERE id = ?", [Number(id)]);
  if (!project) notFound();
  const [tasks, projects] = await Promise.all([
    rows<DailyLog>(db, "SELECT * FROM daily_logs WHERE project_name = ? ORDER BY status DESC, created_at DESC", [project.name]),
    projectNames(),
  ]);
  const completed = tasks.filter((t) => t.status === "Selesai").length;
  const { progress, color } = progressOf(completed, tasks.length);
  const statusBadge = project.status === "Active" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-green-200 bg-green-50 text-green-700";

  return (
    <>
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 border-b border-gray-200 bg-white px-6 py-4 text-sm">
        <Link href="/projects" className="font-medium text-gray-500 transition-colors hover:text-indigo-600">Projects</Link>
        <span className="text-gray-400">/</span>
        <span className="font-bold text-gray-900">{project.name}</span>
      </nav>
      <div className="flex-1 p-6 lg:p-8">
        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Box className="h-6 w-6" aria-hidden="true" /></div>
              <div>
                <h1 className="text-2xl font-bold leading-tight text-gray-900">{project.name}</h1>
                <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                  <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" aria-hidden="true" /> {formatDate(project.start_date, "d M Y")} - {project.end_date ? formatDate(project.end_date, "d M Y") : "Ongoing"}</span>
                  <span>&bull;</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadge}`}>{project.status}</span>
                </div>
              </div>
            </div>
            <div className="hidden min-w-[200px] text-right sm:block">
              <div className="mb-2 flex justify-between text-sm font-semibold"><span className="text-gray-600">Progress</span><span className="text-gray-900">{progress}%</span></div>
              <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-gray-100"><div className={`${color} h-2 rounded-full`} style={{ width: `${progress}%` }} /></div>
              <div className="text-[11px] text-gray-500">{completed} / {tasks.length} Tasks Completed</div>
            </div>
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-gray-600">{project.description}</p>
        </div>

        <ActionForm action={saveLogAction} resetOnSuccess messagePosition="bottom" className="mb-8">
          <input type="hidden" name="log_date" value={todayWib()} />
          <input type="hidden" name="status" value="Dalam Proses" />
          <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm transition-all focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="hidden items-center justify-center pl-4 pr-3 text-gray-400 sm:flex"><Plus className="h-4 w-4" aria-hidden="true" /></div>
              <select name="project_name" defaultValue={project.name} aria-label="Project" className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-3 text-sm font-medium text-gray-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-1/4">
                <option value="">-- Pilih Project --</option>
                {projects.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <div className="hidden h-8 w-px bg-gray-200 sm:block" />
              <input type="text" name="task_name" required maxLength={255} aria-label="Tugas baru" placeholder="Ketik tugas baru untuk project ini..."
                className="w-full flex-1 border-none bg-transparent px-4 py-3 text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0" />
              <SubmitButton className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60 sm:w-auto">
                <span>Add</span> <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </SubmitButton>
            </div>
          </div>
        </ActionForm>

        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-800"><List className="h-4 w-4 text-gray-400" aria-hidden="true" /> Tasks in this Project</h2>
        <ul className="space-y-3">
          {tasks.length === 0 && (
            <li className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Belum ada tugas di project ini. Silakan tambahkan tugas pertama Anda!</li>
          )}
          {tasks.map((task) => {
            const done = task.status === "Selesai";
            return (
              <li key={task.id} className={`group flex items-center justify-between rounded-xl border border-gray-200 p-4 transition-all hover:shadow-md ${done ? "bg-gray-50" : "bg-white"}`}>
                <div className="flex flex-1 items-center gap-4">
                  <ActionForm action={setLogStatusAction} messagePosition="none" className="m-0">
                    <input type="hidden" name="id" value={task.id} />
                    <input type="hidden" name="status" value={done ? "Dalam Proses" : "Selesai"} />
                    <button type="submit" aria-label={done ? `Buka kembali: ${task.task_name}` : `Tandai selesai: ${task.task_name}`}
                      className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${done ? "border-green-500 bg-green-500" : "border-gray-300 hover:border-indigo-500"}`}>
                      {done && <Check className="h-3 w-3 text-white" aria-hidden="true" />}
                    </button>
                  </ActionForm>
                  <div className="flex-1">
                    <h3 className={`mb-1 text-sm font-bold ${done ? "text-gray-400 line-through" : "text-gray-800"}`}>{task.task_name}</h3>
                    <div className={`flex items-center gap-1 text-xs ${done ? "text-gray-400" : "text-gray-500"}`}><CalendarDays className="h-3 w-3" aria-hidden="true" /> {formatDate(task.log_date, "d M")}</div>
                  </div>
                </div>
                <ActionForm action={deleteLogAction} messagePosition="none" confirm="Yakin ingin menghapus tugas ini?"
                  className="opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                  <input type="hidden" name="id" value={task.id} />
                  <button type="submit" aria-label={`Hapus ${task.task_name}`} className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </ActionForm>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
