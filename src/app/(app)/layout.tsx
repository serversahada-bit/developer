import Sidebar from "@/components/Sidebar";
import { isAdmin, requireUser } from "@/lib/auth";
import { MENUS } from "@/lib/menus";

// Pages with the sidebar. Each page still checks its own menu access.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const menus = MENUS.filter((menu) => user.menus.includes(menu.key));
  return (
    <div className="md:p-4">
      <div className="relative flex h-screen overflow-hidden bg-white md:h-[calc(100vh-2rem)] md:rounded-2xl md:border md:border-gray-200 md:shadow-[0_10px_25px_-5px_rgba(0,0,0,0.05)]">
        <Sidebar user={{ full_name: user.full_name, role: user.role, username: user.username }} menus={menus} isAdmin={isAdmin(user)} />
        <div className="flex w-full flex-1 flex-col overflow-y-auto overflow-x-hidden bg-[#fafafa]">{children}</div>
      </div>
    </div>
  );
}
