import type { Metadata } from "next";
import { CheckCircle2, Clock, Flag, Folder, Plus } from "lucide-react";
import { canUseMenu, requireUser } from "@/lib/auth";
import { db, rows } from "@/lib/db";
import { formatDate, todayWib } from "@/lib/dates";
import { projectNames, type DailyLog } from "@/lib/logs";
import { AccessDenied, PageHeader } from "@/components/ui";
import ActionForm, { SubmitButton } from "@/components/ActionForm";
import LogModal, { DeleteLogButton, EditLogButton } from "@/components/LogModal";
import { saveLogAction, setLogStatusAction } from "../log-actions";

export const metadata: Metadata = { title: "My Tasks" };

export default async function MyTasksPage() {
  const user = await requireUser("/my-tasks");
  if (!canUseMenu(user, "my_tasks")) return <AccessDenied user={user} />;

  const [tasks, projects] = await Promise.all([
    rows<DailyLog>(db, "SELECT * FROM daily_logs WHERE status != 'Selesai' ORDER BY created_at DESC"),
    projectNames(),
  ]);
  const today = todayWib();

  return (
    <>
      <PageHeader crumbs={["My Work", "IT PSLU"]} title="My Tasks" />
      <div className="flex-1 p-6 lg:p-10">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-2xl font-bold text-gray-800">What needs to be done today?</h2>

          <ActionForm action={saveLogAction} resetOnSuccess messagePosition="bottom"
            className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all focus-within:ring-2 focus-within:ring-indigo-500">
              <div className="flex flex-col items-stretch gap-2 p-2 sm:flex-row sm:items-center">
                <input type="hidden" name="log_date" value={today} />
                <input type="hidden" name="status" value="Belum Selesai" />
                <div className="hidden items-center justify-center pl-4 pr-3 text-gray-400 sm:flex"><Plus className="h-4 w-4" aria-hidden="true" /></div>
                <select name="project_name" aria-label="Project" className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-3 text-sm font-medium text-gray-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-1/4">
                  <option value="">-- Pilih Project --</option>
                  {projects.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <div className="hidden h-8 w-px bg-gray-200 sm:block" />
                <input type="text" name="task_name" required maxLength={255} aria-label="Task baru" placeholder="Type a new task and press Enter..."
                  className="flex-1 border-none bg-transparent px-3 py-3 text-lg font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0" />
                <SubmitButton className="w-full rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60 sm:mr-2 sm:w-auto">Add Task</SubmitButton>
              </div>
          </ActionForm>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-6 py-4">
              <h3 className="font-semibold text-gray-700">Active Tasks (<span className="text-indigo-600">{tasks.length}</span>)</h3>
              <span className="rounded-md border border-indigo-100 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">Today: {formatDate(today, "d M Y")}</span>
            </div>
            <ul className="divide-y divide-gray-100">
              {tasks.length === 0 && (
                <li className="p-10 text-center text-gray-400">
                  <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-300" aria-hidden="true" />
                  <p className="text-gray-500">All caught up! You have no pending tasks.</p>
                </li>
              )}
              {tasks.map((task) => {
                const overdue = task.deadline && task.deadline < today;
                return (
                  <li key={task.id} className="group flex items-start justify-between p-4 transition-colors hover:bg-gray-50 sm:items-center">
                    <div className="flex flex-1 items-start gap-4 sm:items-center">
                      <ActionForm action={setLogStatusAction} messagePosition="none" className="mt-1 sm:mt-0">
                        <input type="hidden" name="id" value={task.id} />
                        <input type="hidden" name="status" value="Selesai" />
                        <button type="submit" title="Mark as Selesai" aria-label={`Tandai selesai: ${task.task_name}`}
                          className="flex h-6 w-6 items-center justify-center rounded border-2 border-gray-300 bg-white text-transparent transition-colors hover:border-green-500 hover:text-green-500">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </ActionForm>
                      <div className="flex-1 pr-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <h4 className="font-medium leading-tight text-gray-900">{task.task_name}</h4>
                          {task.project_name && (
                            <span className="inline-flex items-center gap-1 self-start rounded border border-purple-100 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 sm:self-auto">
                              <Folder className="h-2.5 w-2.5 opacity-70" aria-hidden="true" /> {task.project_name}
                            </span>
                          )}
                          <span className={`self-start rounded border px-2 py-0.5 text-[10px] font-semibold sm:self-auto ${task.status === "Dalam Proses" ? "border-yellow-200 bg-yellow-100 text-yellow-700" : "border-gray-200 bg-gray-100 text-gray-600"}`}>{task.status}</span>
                          {task.deadline && (
                            <span className={`inline-flex items-center gap-1 self-start rounded border px-2 py-0.5 text-[10px] font-semibold sm:self-auto ${overdue ? "border-red-200 bg-red-50 text-red-700" : "border-orange-100 bg-orange-50 text-orange-700"}`}>
                              <Flag className="h-2.5 w-2.5 opacity-70" aria-hidden="true" /> {formatDate(task.deadline, "d M Y")}
                            </span>
                          )}
                        </div>
                        {task.description && <p className="mt-1 truncate text-sm text-gray-500" title={task.description}>{task.description}</p>}
                        <div className="mt-1.5 flex items-center gap-1 font-mono text-[10px] text-gray-400">
                          <Clock className="h-2.5 w-2.5" aria-hidden="true" /> Added {formatDate(task.created_at, "H:i")} &bull; LOG-{String(task.id).padStart(3, "0")}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                      <EditLogButton log={task} />
                      <DeleteLogButton id={task.id} label="Hapus tugas ini?" />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
      <LogModal projects={projects} today={today} />
    </>
  );
}
