// Document kinds shared by server and client code.

export type DocType = "fpa" | "fpaa";
export type DetailType = DocType | "fpm";

export function isDocType(value: unknown): value is DocType {
  return value === "fpa" || value === "fpaa";
}

export function isDetailType(value: unknown): value is DetailType {
  return value === "fpa" || value === "fpaa" || value === "fpm";
}

export function approvalTable(type: DocType): "fpa_submissions" | "fpa_a_submissions" {
  return type === "fpa" ? "fpa_submissions" : "fpa_a_submissions";
}

export const DOC_LABEL: Record<DetailType, string> = { fpa: "FPA", fpaa: "FPA-A", fpm: "FPM" };

// The detail page is opened from Approvals, the Task board (?from=tasks), or an email link. Only
// 'tasks' is kept, so the parameter cannot point the back link anywhere else.
export function detailOrigin(from: unknown): "" | "tasks" {
  return from === "tasks" ? "tasks" : "";
}

export function detailUrl(type: DetailType, id: number, origin: "" | "tasks" = ""): string {
  return `/approvals/${type}/${id}${origin ? `?from=${origin}` : ""}`;
}

export function revisionUrl(type: DocType, id: number): string {
  return `/pengajuan/${type === "fpa" ? "fpa" : "fpa-a"}?revision=${id}`;
}
