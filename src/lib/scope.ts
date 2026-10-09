// Feature/scope items of FPA (solusi) and FPA-A (deskripsi_perubahan), stored as
// {"format": ..., "items": [{nama, keterangan}]} JSON, exactly as the PHP app stores them.

export const SCOPE_NAME_MAX = 200;
export const SCOPE_DETAIL_MAX = 1000;

export type ScopeFormat = "fpa_solusi_list" | "fpaa_scope_list";
export interface ScopeItem {
  nama: string;
  keterangan: string;
}

export class ScopeError extends Error {}

// Both name and explanation are required for every item.
export function parseScopeItems(input: Record<string, string>[] | null, itemLabel = "item"): ScopeItem[] {
  if (!input || input.length === 0) throw new ScopeError(`Tambahkan minimal satu ${itemLabel} yang ingin diajukan.`);
  if (input.length > 50) throw new ScopeError(`Maksimal 50 ${itemLabel} dalam satu pengajuan.`);
  return input.map((item) => {
    const nama = (item.nama ?? "").trim();
    const keterangan = (item.keterangan ?? "").trim();
    if (nama === "" || keterangan === "") {
      throw new ScopeError(`Isi nama dan keterangan/rumus untuk setiap ${itemLabel}, atau hapus item yang tidak digunakan.`);
    }
    if ([...nama].length > SCOPE_NAME_MAX) throw new ScopeError(`Nama ${itemLabel} maksimal ${SCOPE_NAME_MAX} karakter.`);
    if ([...keterangan].length > SCOPE_DETAIL_MAX) throw new ScopeError(`Keterangan/rumus ${itemLabel} maksimal 1.000 karakter.`);
    return { nama, keterangan };
  });
}

export function encodeScopeItems(items: ScopeItem[], format: ScopeFormat): string {
  const json = JSON.stringify({ format, items });
  if (new TextEncoder().encode(json).length > 60000) throw new ScopeError("Daftar item terlalu panjang. Ringkas deskripsi sebelum mengirim.");
  return json;
}

// A list of items, or null when the value is not a stored item list. Documents saved before the
// name/description split hold plain strings; they come back as a name with an empty description.
export function decodeScopeItems(description: string | null | undefined, format: ScopeFormat): ScopeItem[] | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(description ?? "");
  } catch {
    return null;
  }
  if (!decoded || typeof decoded !== "object") return null;
  const { format: storedFormat, items } = decoded as { format?: unknown; items?: unknown };
  if (storedFormat !== format || !Array.isArray(items) || items.length === 0) return null;
  const result: ScopeItem[] = [];
  for (const item of items) {
    if (typeof item === "string") result.push({ nama: item, keterangan: "" });
    else if (item && typeof item.nama === "string" && typeof item.keterangan === "string") result.push({ nama: item.nama, keterangan: item.keterangan });
    else return null;
  }
  return result;
}

// A legacy item is one line of free text. On revision it prefills the explanation and leaves the
// name empty, so the requester supplies the name the new form requires.
export function scopeItemsForRevision(items: ScopeItem[] | null, raw: string | null): ScopeItem[] {
  if (items === null) {
    const text = (raw ?? "").trim();
    return text === "" ? [] : [{ nama: "", keterangan: text }];
  }
  return items.map((item) => (item.keterangan === "" ? { nama: "", keterangan: item.nama } : item));
}

export function scopeItemsAsText(items: ScopeItem[]): string {
  return items.flatMap((item, index) => [`${index + 1}. ${item.nama}`, ...(item.keterangan !== "" ? [item.keterangan] : [])]).join("\n");
}
