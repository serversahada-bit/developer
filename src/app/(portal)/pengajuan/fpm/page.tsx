import type { Metadata } from "next";
import { canUseMenu, requireUser } from "@/lib/auth";
import { db, rows } from "@/lib/db";
import { todayWib } from "@/lib/dates";
import { AccessDenied } from "@/components/ui";
import FpmForm from "./FpmForm";

export const metadata: Metadata = { title: "FPM - Form Permintaan Maintenance" };

export default async function FpmPage() {
  const user = await requireUser("/pengajuan/fpm");
  if (!canUseMenu(user, "pengajuan")) return <AccessDenied user={user} />;
  // Systems reported before plus project names, for the autocomplete list.
  const [systems, projects] = await Promise.all([
    rows<{ name: string }>(db, "SELECT DISTINCT nama_sistem AS name FROM fpm_submissions WHERE nama_sistem IS NOT NULL ORDER BY nama_sistem"),
    rows<{ name: string }>(db, "SELECT name FROM projects ORDER BY name"),
  ]);
  const options = [...new Set([...systems, ...projects].map((r) => r.name))];
  return <FpmForm user={{ full_name: user.full_name, role: user.role, username: user.username, division: user.division }} today={todayWib()} sistemOptions={options} />;
}
