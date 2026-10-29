import "server-only";
import { db, exec, row, rows, transaction, type Row } from "./db";
import { UserError, type CurrentUser } from "./auth";
import { approvalTable, costColumns, effectiveCost, type DocType } from "./documents";
import { approvalRun, approvalSteps, resolveAtasan, restartApproval, startApproval, type ApprovalRun } from "./approval";
import { ScopeError, decodeScopeItems, encodeScopeItems, parseScopeItems, scopeItemsForRevision, type ScopeItem } from "./scope";
import { indexedRows, parseRupiah, str, strs } from "./form";
import { isDateString, wibDateTime } from "./dates";

function text(form: FormData, key: string, max = 10000, required = false): string {
  const value = str(form, key).trim();
  if ((required && value === "") || [...value].length > max) throw new UserError(`Periksa isian ${key} (maksimal ${max} karakter).`);
  return value;
}

function choices(form: FormData, key: string, allowed: string[], required = false): string {
  const values = strs(form, `${key}[]`);
  if (!values.every((value) => allowed.includes(value))) throw new UserError(`Pilihan ${key} tidak valid.`);
  if (required && values.length === 0) throw new UserError(`Pilih minimal satu ${key}.`);
  return [...new Set(values)].join(", ");
}

function number(form: FormData, key: string, money = false): string | null {
  const value = text(form, key, 40);
  if (value === "") return null;
  if (money) {
    const amount = parseRupiah(value);
    if (amount === undefined) throw new UserError("Biaya tidak valid. Gunakan titik untuk ribuan dan koma untuk desimal.");
    return amount;
  }
  if (!/^\d{1,8}$/.test(value)) throw new UserError(`Isian ${key} harus berupa angka positif atau nol.`);
  return value;
}

function scopeItems(form: FormData, field: string, label: string, format: "fpa_solusi_list" | "fpaa_scope_list"): string {
  try {
    return encodeScopeItems(parseScopeItems(indexedRows(form, field, ["nama", "keterangan"]), label), format);
  } catch (error) {
    if (error instanceof ScopeError) throw new UserError(error.message);
    throw error;
  }
}

function submissionValues(type: DocType, form: FormData, user: CurrentUser): Record<string, string | number | null> {
  if (!user.division) throw new UserError("Divisi akun Anda belum diatur. Hubungi Admin untuk mengaturnya melalui menu Users.");
  const data: Record<string, string | number | null> = { departemen: user.division };
  if (type === "fpa") {
    data.nama_head = text(form, "nama_head", 100, true);
    data.nama_aplikasi = text(form, "nama_aplikasi", 200, true);
    data.masalah = text(form, "masalah", 10000, true);
    data.solusi = scopeItems(form, "solusi", "fitur/solusi", "fpa_solusi_list");
    const date = text(form, "tanggal_pengajuan", 10, true);
    if (!isDateString(date)) throw new UserError("Tanggal pengajuan tidak valid.");
    data.tanggal_pengajuan = date;
    const options: Record<string, string[]> = {
      urgensi: ["High", "Medium", "Low"],
      status_biaya: ["Berbayar", "Tanpa Biaya"],
      skala_aplikasi: ["Kecil/Nemo Tetra", "Menengah/Salmon", "Besar/Whale"],
    };
    for (const [key, allowed] of Object.entries(options)) {
      const value = text(form, key, 50, key === "urgensi");
      if (value !== "" && !allowed.includes(value)) throw new UserError(`Pilihan ${key} tidak valid.`);
      data[key] = value === "" ? null : value;
    }
    data.dampak_bisnis = text(form, "dampak_bisnis");
    data.rahasia = str(form, "rahasia") ? 1 : 0;
    data.metode_eksekusi = choices(form, "metode_eksekusi", ["In-House", "Outsource", "Lisensi"]);
    data.estimasi_durasi = number(form, "estimasi_durasi");
    data.estimasi_biaya = number(form, "estimasi_biaya", true);
    for (const key of ["server", "lisensi", "integrasi", "hardware"]) data[`catatan_teknis_${key}`] = text(form, `catatan_${key}`);
  } else {
    // "--manual--" in the parent FPA list means the number was typed into nomor_fpa_manual.
    const parent = str(form, "nomor_fpa_utama") === "--manual--" ? "nomor_fpa_manual" : "nomor_fpa_utama";
    data.nomor_fpa_utama = text(form, parent, 50, true);
    data.nama_proyek = text(form, "nama_proyek", 200, true);
    data.jenis_perubahan = choices(form, "jenis_perubahan", ["Penambahan Fitur/Scope", "Perubahan Anggaran", "Perubahan Status"], true);
    data.deskripsi_perubahan = scopeItems(form, "deskripsi_perubahan", "fitur/scope", "fpaa_scope_list");
    data.tambahan_waktu = number(form, "tambahan_waktu");
    data.tambahan_biaya = number(form, "tambahan_biaya", true);
    data.catatan = text(form, "catatan");
  }
  return data;
}

export async function saveApprovalSubmission(type: DocType, form: FormData, user: CurrentUser, revisionId = 0, expectedCycle = 0): Promise<number> {
  const table = approvalTable(type);
  const data = submissionValues(type, form, user);
  // Read from Absensi outside the transaction; a revision re-reads it, as the supervisor may have changed.
  const atasan = await resolveAtasan(user.id);
  return transaction(async (tx) => {
    if (revisionId) {
      const document = await row(tx, `SELECT * FROM ${table} WHERE id = ? FOR UPDATE`, [revisionId]);
      const run = await approvalRun(tx, type, revisionId, true);
      if (!document || !run || run.state !== "revision" || run.requester_id !== user.id || Number(document.created_by_user_id) !== user.id) {
        throw new UserError("Dokumen ini tidak dapat Anda revisi.");
      }
      if (expectedCycle !== run.cycle) throw new UserError("Versi revisi sudah berubah. Muat ulang halaman.");
      // The form was prefilled with the last budget correction, so what the requester sends now replaces it.
      const assignments = Object.keys(data).map((key) => `${key} = ?`).join(", ");
      await exec(tx, `UPDATE ${table} SET ${assignments}, ${costColumns(type).corrected} = NULL, status_dokumen = 'Diajukan' WHERE id = ?`, [...Object.values(data), revisionId]);
      await restartApproval(tx, type, revisionId, run, user, atasan);
      return revisionId;
    }
    // Serialize monthly numbering across both forms without changing existing numbers.
    await row(tx, "SELECT id FROM users ORDER BY id LIMIT 1 FOR UPDATE");
    const numberColumn = type === "fpa" ? "nomor_fpa" : "nomor_fpa_a";
    const prefix = type === "fpa" ? "FPA/ITS/" : "FPA-A/ITS/";
    const now = wibDateTime();
    const suffix = `/${now.slice(5, 7)}/${now.slice(0, 4)}`;
    const existing = await rows<{ number: string }>(tx, `SELECT ${numberColumn} AS number FROM ${table} WHERE ${numberColumn} LIKE ?`, [`${prefix}%${suffix}`]);
    let max = 0;
    for (const { number: existingNumber } of existing) {
      const part = existingNumber.slice(prefix.length, existingNumber.length - suffix.length);
      if (/^\d+$/.test(part)) max = Math.max(max, Number(part));
    }
    data[numberColumn] = `${prefix}${String(max + 1).padStart(3, "0")}${suffix}`;
    data.created_by_user_id = user.id;
    data[type === "fpa" ? "nama_pemohon" : "user_nama"] = user.full_name;
    data.status_dokumen = "Diajukan";
    const columns = Object.keys(data);
    const result = await exec(tx, `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`, Object.values(data));
    await startApproval(tx, type, result.insertId, user.id, user, atasan);
    return result.insertId;
  });
}

export interface RevisionData {
  document: Row;
  run: ApprovalRun;
  scope: ScopeItem[];
}

// The stored document shaped for the form, when the user may revise it.
export async function revisionFormData(type: DocType, id: number, user: CurrentUser): Promise<RevisionData> {
  const document = await row(db, `SELECT * FROM ${approvalTable(type)} WHERE id = ?`, [id]);
  const run = await approvalRun(db, type, id);
  if (!document || !run || run.state !== "revision" || run.requester_id !== user.id) throw new UserError("Dokumen ini tidak dapat Anda revisi.");
  const field = type === "fpa" ? "solusi" : "deskripsi_perubahan";
  const scope = scopeItemsForRevision(decodeScopeItems(document[field], type === "fpa" ? "fpa_solusi_list" : "fpaa_scope_list"), document[field]);
  // The form starts from the budget as last corrected by Tim IT / Manager IT.
  const { original, corrected } = costColumns(type);
  if (document[corrected] !== null && document[corrected] !== undefined) {
    document[original] = effectiveCost(type, document);
    if (type === "fpa") document.status_biaya = Number(document[original]) > 0 ? "Berbayar" : "Tanpa Biaya";
  }
  for (const key of ["estimasi_biaya", "tambahan_biaya"]) {
    if (document[key] !== null && document[key] !== undefined) {
      document[key] = Number(document[key]).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }
  return { document, run, scope };
}

export { approvalSteps };

const FPM_KENDALA = ["Bug/Error", "Performa Lambat", "Perubahan Data"];

export async function saveFpm(form: FormData, user: CurrentUser): Promise<void> {
  const namaSistem = text(form, "nama_sistem", 200, true);
  const tanggal = text(form, "tanggal_kejadian", 10, true);
  if (!isDateString(tanggal)) throw new UserError("Tanggal kejadian tidak valid.");
  const kendala = strs(form, "jenis_kendala[]");
  if (!kendala.every((value) => FPM_KENDALA.includes(value))) throw new UserError("Pilihan jenis kendala tidak valid.");
  if (str(form, "jenis_kendala_lainnya")) {
    const lainnya = text(form, "kendala_lainnya", 150, true);
    kendala.push(`Lainnya: ${lainnya}`);
  }
  if (kendala.length === 0) throw new UserError("Pilih minimal satu jenis kendala.");
  const jenis = [...new Set(kendala)].join(", ");
  if ([...jenis].length > 200) throw new UserError("Jenis kendala terlalu panjang.");
  const deskripsi = text(form, "deskripsi_kendala", 10000, true);
  await exec(db, `INSERT INTO fpm_submissions (created_by_user_id, nama_sistem, nama_pelapor, tanggal_kejadian, jenis_kendala, deskripsi_kendala)
    VALUES (?, ?, ?, ?, ?, ?)`, [user.id, namaSistem, user.full_name, tanggal, jenis, deskripsi]);
}
