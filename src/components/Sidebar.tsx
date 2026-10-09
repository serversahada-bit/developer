"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Activity, CalendarDays, ChartLine, CheckCheck, FolderOpen, Hourglass, ListTodo, LogOut, Menu, Send, Users, type LucideIcon } from "lucide-react";
import type { MenuDefinition, MenuIcon } from "@/lib/menus";

const ICONS: Record<MenuIcon, LucideIcon> = {
  folder: FolderOpen,
  activity: Activity,
  "list-todo": ListTodo,
  hourglass: Hourglass,
  calendar: CalendarDays,
  chart: ChartLine,
  "check-check": CheckCheck,
  send: Send,
};

interface SidebarProps {
  user: { full_name: string; role: string; username: string };
  menus: MenuDefinition[];
  isAdmin: boolean;
}

function NavLink({ href, active, icon: Icon, label }: { href: string; active: boolean; icon: LucideIcon; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`mb-1 flex items-center gap-3 rounded-md px-3 py-2 transition-colors ${active ? "bg-indigo-50 font-bold text-indigo-700 shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> {label}
    </Link>
  );
}

export default function Sidebar({ user, menus, isAdmin }: SidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const groups = menus.reduce<Record<string, MenuDefinition[]>>((acc, menu) => {
    (acc[menu.group] ??= []).push(menu);
    return acc;
  }, {});

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buka menu"
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      {open && <div onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-gray-900/50 md:hidden" aria-hidden="true" />}

      <aside
        className={`absolute z-40 flex h-full w-[260px] shrink-0 flex-col border-r border-gray-200 bg-gray-50 transition-transform md:static md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.ico" alt="Logo" className="h-10 w-10 rounded-lg border border-gray-100 object-contain shadow-sm" />
            <div>
              <div className="text-sm font-semibold">IT PSLU</div>
              <div className="text-xs text-gray-500">Departemen IT PT Sahada Laku Utama</div>
            </div>
          </div>
        </div>

        <div className="mx-3 mt-4 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <div className="break-words text-sm font-semibold text-gray-900">{user.full_name}</div>
          <div className="mt-1 text-xs text-gray-500">
            {user.role} &middot; {user.username}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 text-sm" aria-label="Menu utama">
          {menus.length === 0 && <p className="px-2 text-xs text-gray-500">Belum ada menu yang diberikan. Hubungi Admin.</p>}
          {Object.entries(groups).map(([group, items], index) => (
            <div key={group}>
              <div className={`${index ? "mt-6" : ""} mb-2 px-2 text-xs font-medium uppercase tracking-wider text-gray-400`}>{group}</div>
              {items.map((menu) => (
                <NavLink key={menu.key} href={menu.href} active={isActive(menu.href)} icon={ICONS[menu.icon]} label={menu.label} />
              ))}
            </div>
          ))}
          {isAdmin && (
            <>
              <div className="mb-2 mt-6 px-2 text-xs font-medium uppercase tracking-wider text-gray-400">Pengaturan</div>
              <NavLink href="/users" active={isActive("/users")} icon={Users} label="Users" />
            </>
          )}
          <div className="mt-8 border-t border-gray-200 pt-4">
            <form action="/logout" method="POST">
              <button type="submit" className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-red-600 transition-colors hover:bg-red-50">
                <LogOut className="h-4 w-4" aria-hidden="true" /> Logout
              </button>
            </form>
          </div>
        </nav>
      </aside>
    </>
  );
}
