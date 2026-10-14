// Sidebar menus an Admin grants to each non-Admin account (table user_menu_access). Keys are the
// same as the PHP app, so existing grants keep working. A route under no granted menu is blocked.

export type MenuKey = "projects" | "activity_log" | "my_tasks" | "tasks" | "calendar" | "reports" | "approvals" | "pengajuan";

export type MenuIcon = "folder" | "activity" | "list-todo" | "hourglass" | "calendar" | "chart" | "check-check" | "send";

export interface MenuDefinition {
  key: MenuKey;
  label: string;
  icon: MenuIcon;
  href: string;
  group: "Main Menu" | "Pengajuan Layanan IT";
}

export const MENUS: MenuDefinition[] = [
  { key: "projects", label: "Projects", icon: "folder", href: "/projects", group: "Main Menu" },
  { key: "activity_log", label: "Activity Log", icon: "activity", href: "/activity", group: "Main Menu" },
  { key: "my_tasks", label: "My Tasks", icon: "list-todo", href: "/my-tasks", group: "Main Menu" },
  { key: "tasks", label: "Task", icon: "hourglass", href: "/tasks", group: "Main Menu" },
  { key: "calendar", label: "Calendar", icon: "calendar", href: "/calendar", group: "Main Menu" },
  { key: "reports", label: "Reports", icon: "chart", href: "/reports", group: "Main Menu" },
  { key: "approvals", label: "Approvals", icon: "check-check", href: "/approvals", group: "Main Menu" },
  { key: "pengajuan", label: "Buat Pengajuan", icon: "send", href: "/pengajuan", group: "Pengajuan Layanan IT" },
];

export const MENU_KEYS = MENUS.map((menu) => menu.key);

export function isMenuKey(value: unknown): value is MenuKey {
  return typeof value === "string" && (MENU_KEYS as string[]).includes(value);
}

export function menuByKey(key: MenuKey): MenuDefinition {
  return MENUS.find((menu) => menu.key === key)!;
}

// Every non-Admin account gets exactly these menus, whatever user_menu_access holds: they only submit
// service requests. Task shows how busy the developers are (read-only; "rahasia" documents stay
// masked). Approvals stays because requesters follow, revise and test their documents there and
// approvers decide there. The first entry is the landing page.
export const NON_ADMIN_MENUS: MenuKey[] = ["pengajuan", "tasks", "approvals"];

// Projects, Activity Log and My Tasks share the same daily log / project mutations, as process.php did.
export const LOG_MENUS: MenuKey[] = ["projects", "activity_log", "my_tasks"];

export const USER_ROLES = ["Manager", "SPV", "Koordinator", "Admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_DIVISIONS = ["HC", "Markom", "ADV", "FAT", "MP", "FF", "IT", "Meta", "CRM", "CSO", "Tiktok", "Marketing Branding"] as const;
