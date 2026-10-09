import { requireUser } from "@/lib/auth";

// Pengajuan portal and forms: full-width pages without the sidebar, as in the PHP app.
export default async function PortalLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return <div className="min-h-screen bg-gray-100 p-4">{children}</div>;
}
