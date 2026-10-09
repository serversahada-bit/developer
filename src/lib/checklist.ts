import "server-only";
import type { PoolConnection } from "mysql2/promise";
import { db, exec, row, rows, transaction, type Db, type Row } from "./db";
import { decodeScopeItems } from "./scope";
import { UserError, type CurrentUser } from "./auth";
import { approvalTable, type DocType } from "./documents";

export interface ChecklistItem {
  id: number;
  document_type: DocType;
  document_id: number;
  item_index: number;
  item_text: string;
  item_detail: string | null;
  dev_done_by: number | null;
  dev_done_at: string | null;
  user_tested_by: number | null;
  user_tested_at: string | null;
  auto_completed: number;
  rejected_note: string | null;
  rejected_by: number | null;
  rejected_at: string | null;
  dev_done_by_name: string | null;
  user_tested_by_name: string | null;
  rejected_by_name: string | null;
}

// Snapshot the Solusi/Fitur-Scope list into per-item rows once a document reaches final approval.
// Called inside the same transaction as the final-approve decision.
export async function createChecklistItems(tx: PoolConnection, type: DocType, id: number, document: Row): Promise<void> {
  const raw = (type === "fpa" ? document.solusi : document.deskripsi_perubahan) ?? "";
  let items = decodeScopeItems(raw, type === "fpa" ? "fpa_solusi_list" : "fpaa_scope_list");
  if (items === null) {
    const text = String(raw).trim();
    items = text === "" ? [] : [{ nama: text, keterangan: "" }];
  }
  for (const [index, item] of items.entries()) {
    await exec(tx, "INSERT INTO submission_checklist_items (document_type, document_id, item_index, item_text, item_detail) VALUES (?, ?, ?, ?, ?)", [
      type, id, index + 1, item.nama, item.keterangan === "" ? null : item.keterangan,
    ]);
  }
}

// An item left waiting more than 7 days after Dev marked it done is treated as tested:
// the requester gets a review window, not an indefinite block on the checklist.
async function autoCompleteOverdueChecklistItems(conn: Db, type: DocType, id: number): Promise<void> {
  await exec(conn, `UPDATE submission_checklist_items
    SET user_tested_at = NOW(), auto_completed = 1
    WHERE document_type = ? AND document_id = ?
      AND dev_done_by IS NOT NULL AND user_tested_at IS NULL
      AND dev_done_at <= (NOW() - INTERVAL 7 DAY)`, [type, id]);
}

export async function checklistItems(type: DocType, id: number): Promise<ChecklistItem[]> {
  await autoCompleteOverdueChecklistItems(db, type, id);
  return rows<ChecklistItem>(db, `SELECT c.*, d.full_name AS dev_done_by_name, u.full_name AS user_tested_by_name, r.full_name AS rejected_by_name
    FROM submission_checklist_items c
    LEFT JOIN users d ON d.id = c.dev_done_by
    LEFT JOIN users u ON u.id = c.user_tested_by
    LEFT JOIN users r ON r.id = c.rejected_by
    WHERE c.document_type = ? AND c.document_id = ? ORDER BY c.item_index`, [type, id]);
}

// [done, total], counting an item done once it has been tested (by the requester or the 7-day timeout).
export function checklistProgress(items: ChecklistItem[]): [number, number] {
  return [items.filter((item) => item.user_tested_at !== null).length, items.length];
}

export type ChecklistField = "dev" | "user_ok" | "user_reject";

export async function toggleChecklistItem(type: string, itemId: number, field: string, user: CurrentUser, note: string | null): Promise<void> {
  if (type !== "fpa" && type !== "fpaa") throw new UserError("Jenis dokumen tidak valid.");
  if (!["dev", "user_ok", "user_reject"].includes(field)) throw new UserError("Kolom checklist tidak valid.");
  const table = approvalTable(type);
  await transaction(async (tx) => {
    const item = await row(tx, "SELECT * FROM submission_checklist_items WHERE id = ? AND document_type = ? FOR UPDATE", [itemId, type]);
    if (!item) throw new UserError("Item checklist tidak ditemukan.");
    const document = await row(tx, `SELECT * FROM ${table} WHERE id = ? FOR UPDATE`, [item.document_id]);
    if (!document || document.status_dokumen !== "Disetujui") throw new UserError("Dokumen belum atau tidak lagi berstatus Disetujui.");

    if (field === "dev") {
      if (user.role !== "Admin") throw new UserError("Hanya Admin yang dapat menandai item ini selesai dikerjakan.");
      if (item.dev_done_by === null) {
        // Starting a fresh test cycle: clear any earlier revision note so it doesn't linger once fixed.
        await exec(tx, "UPDATE submission_checklist_items SET dev_done_by = ?, dev_done_at = NOW(), rejected_note = NULL, rejected_by = NULL, rejected_at = NULL WHERE id = ?", [user.id, itemId]);
      } else {
        // Unchecking development also clears the user's test confirmation: "tested" must never outlive "done".
        await exec(tx, "UPDATE submission_checklist_items SET dev_done_by = NULL, dev_done_at = NULL, user_tested_by = NULL, user_tested_at = NULL, auto_completed = 0 WHERE id = ?", [itemId]);
      }
      return;
    }
    if (Number(document.created_by_user_id) !== user.id) throw new UserError("Hanya pemohon dokumen ini yang dapat menandai pengujian.");
    if (item.dev_done_by === null) throw new UserError("Item ini belum ditandai selesai dikerjakan oleh Developer.");
    if (item.user_tested_at !== null) throw new UserError("Item ini sudah selesai ditest.");
    if (field === "user_ok") {
      await exec(tx, "UPDATE submission_checklist_items SET user_tested_by = ?, user_tested_at = NOW(), auto_completed = 0 WHERE id = ?", [user.id, itemId]);
      return;
    }
    // user_reject: back to square one for Dev, with a note on what still needs fixing.
    const text = (note ?? "").trim();
    if (text === "") throw new UserError("Isi catatan yang belum sesuai sebelum mengirim revisi.");
    if ([...text].length > 1000) throw new UserError("Catatan maksimal 1.000 karakter.");
    await exec(tx, `UPDATE submission_checklist_items
      SET dev_done_by = NULL, dev_done_at = NULL, user_tested_by = NULL, user_tested_at = NULL, auto_completed = 0,
          rejected_note = ?, rejected_by = ?, rejected_at = NOW()
      WHERE id = ?`, [text, user.id, itemId]);
  });
}
