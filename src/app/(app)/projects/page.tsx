import type { Metadata } from "next";
import Link from "next/link";
import { Box, CalendarDays, Trash2 } from "lucide-react";
import { canUseMenu, requireUser } from "@/lib/auth";
import { db, rows } from "@/lib/db";
import { formatDate, todayWib } from "@/lib/dates";
import { progressOf, type Project } from "@/lib/logs";
import { AccessDenied, PageHeader } from "@/components/ui";
import ActionForm from "@/components/ActionForm";
import { deleteProjectAction } from "../log-actions";
import ProjectModal from "./ProjectModal";

export const metadata: Metadata = { title: "Projects Overview" };

type ProjectWithCounts = Project & { total_tasks: number; completed_tasks: number };

function ProjectCard({ project }: { project: ProjectWithCounts }) {
  const total = Number(project.total_tasks);
  const completed = Number(project.completed_tasks);
  const { progress, color } = progressOf(completed, total);
  const statusBadge = project.status === "Active" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-green-200 bg-green-50 text-green-700";
  return (
    <div className="group relative flex flex-col rounded-xl border border-gray-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <ActionForm action={deleteProjectAction} messagePosition="none" confirm="Yakin ingin menghapus project ini? Tugas-tugasnya tidak akan ikut terhapus."
        className="absolute right-4 top-4 z-20 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <input type="hidden" name="id" value={project.id} />
        <button type="submit" aria-label={`Hapus project ${project.name}`} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
      </ActionForm>
      <div className="mb-4 flex items-start justify-between pr-8">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Box className="h-5 w-5" aria-hidden="true" /></div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusBadge}`}>{project.status}</span>
      </div>
      <h3 className="mb-1 text-lg font-bold leading-tight text-gray-900">
        <Link href={`/projects/${project.id}`} className="before:absolute before:inset-0 hover:text-indigo-600">{project.name}</Link>
      </h3>
      <p className="relative z-10 mb-6 line-clamp-2 min-h-[40px] text-sm text-gray-500">{project.description || "Tidak ada deskripsi."}</p>
      <div className="relative z-10 mt-auto">
        <div className="mb-4 flex items-center gap-1.5 text-xs font-medium text-gray-500">
          <CalendarDays className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
          {formatDate(project.start_date, "d M Y")} - {project.end_date ? formatDate(project.end_date, "d M Y") : "Ongoing"}
        </div>
        <div className="mb-1 flex justify-between text-xs font-semibold">
          <span className="text-gray-700">Progress</span>
          <span className="text-gray-900">{progress}%</span>
        </div>
        <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className={`${color} h-2 rounded-full transition-all duration-500`} style={{ width: `${progress}%` }} />
        </div>
        <div className="text-right text-[10px] text-gray-500">{completed} / {total} Tasks Completed</div>
      </div>
    </div>
  );
}

function ProjectSection({ title, subtitle, empty, projects }: { title: string; subtitle: string; empty: string; projects: ProjectWithCounts[] }) {
  return (
    <section>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
        <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {projects.length === 0 && <div className="col-span-full rounded-xl border-2 border-dashed border-gray-300 p-10 text-center text-gray-500">{empty}</div>}
        {projects.map((project) => <ProjectCard key={project.id} project={project} />)}
      </div>
    </section>
  );
}

export default async function ProjectsPage() {
  const user = await requireUser("/projects");
  if (!canUseMenu(user, "projects")) return <AccessDenied user={user} />;

  const projects = await rows<ProjectWithCounts>(db, `SELECT p.*,
      (SELECT COUNT(*) FROM daily_logs t WHERE t.project_name = p.name) AS total_tasks,
      (SELECT COUNT(*) FROM daily_logs t WHERE t.project_name = p.name AND t.status = 'Selesai') AS completed_tasks
    FROM projects p ORDER BY p.created_at DESC`);

  return (
    <>
      <PageHeader crumbs={["IT PSLU"]} title="Projects Overview">
        <ProjectModal today={todayWib()} />
      </PageHeader>
      <div className="flex-1 space-y-12 p-6 lg:p-8">
        <ProjectSection title="Non FPA" subtitle="Pantau target dan aplikasi yang sedang dikembangkan bulan ini." empty="Belum ada Project Non-FPA."
          projects={projects.filter((p) => p.category !== "FPA")} />
        <ProjectSection title="With FPA" subtitle="Pantau target dan aplikasi formal yang sedang dikembangkan bulan ini." empty="Belum ada Project With FPA."
          projects={projects.filter((p) => p.category === "FPA")} />
      </div>
    </>
  );
}
