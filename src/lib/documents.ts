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

// FPA / FPA-A approval stages, in order. Manager FAT only decides when the document has a cost.
export type Stage = "atasan" | "tim_it" | "manager_it" | "manager_fat";
export const STAGES: Stage[] = ["atasan", "tim_it", "manager_it", "manager_fat"];
export const STAGE_LABEL: Record<Stage, string> = { atasan: "Atasan Langsung", tim_it: "Tim IT", manager_it: "Manager IT", manager_fat: "Manager FAT" };

// The requester's cost and the Tim IT / Manager IT correction of it.
export function costColumns(type: DocType): { original: "estimasi_biaya" | "tambahan_biaya"; corrected: "estimasi_biaya_admin" | "tambahan_biaya_admin" } {
  return type === "fpa" ? { original: "estimasi_biaya", corrected: "estimasi_biaya_admin" } : { original: "tambahan_biaya", corrected: "tambahan_biaya_admin" };
}

// The cost that decides whether Manager FAT approves: the latest correction when there is one,
// otherwise what the requester wrote (an FPA marked "Tanpa Biaya" has none).
export function effectiveCost(type: DocType, document: Record<string, unknown>): number {
  const { original, corrected } = costColumns(type);
  if (document[corrected] !== null && document[corrected] !== undefined) return Number(document[corrected]);
  if (type === "fpa" && document.status_biaya !== "Berbayar") return 0;
  return Number(document[original] ?? 0);
}

export const rupiah = (value: unknown) => `Rp ${Math.round(Number(value)).toLocaleString("id-ID")}`;

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
