// Small readers for FormData that never trust the shape of the submitted value.

export function str(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

export function strs(form: FormData, key: string): string[] {
  return form.getAll(key).filter((value): value is string => typeof value === "string");
}

export function positiveInt(form: FormData, key: string): number {
  const value = str(form, key).trim();
  return /^[1-9][0-9]{0,9}$/.test(value) ? Number(value) : 0;
}

// Rows posted as name="prefix[0][nama]", name="prefix[0][keterangan]", ... in submission order.
export function indexedRows(form: FormData, prefix: string, fields: string[]): Record<string, string>[] | null {
  const byIndex = new Map<number, Record<string, string>>();
  const pattern = new RegExp(`^${prefix}\\[(\\d+)\\]\\[(${fields.join("|")})\\]$`);
  for (const [key, value] of form.entries()) {
    const match = pattern.exec(key);
    if (!match) continue;
    if (typeof value !== "string") return null;
    const index = Number(match[1]);
    const entry = byIndex.get(index) ?? {};
    entry[match[2]] = value;
    byIndex.set(index, entry);
  }
  return [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, entry]) => entry);
}

export type ActionState = { error?: string; errors?: string[]; success?: string } | null;
