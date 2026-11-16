-- Status Selesai untuk FPA / FPA-A, batas waktu pengujian checklist (hari kerja), email checklist,
-- dan batas waktu revisi FPA-A. Jalankan sekali di database Developer (DB_NAME) sebelum deploy
-- versi yang memakainya. Aturannya ada di FLOW_APLIKASI.txt bagian 7.
SET time_zone = '+07:00';

-- Selesai = semua item checklist sudah ditest (FPA: juga semua FPA-A yang masih berjalan sudah selesai).
-- tanggal_selesai dipakai untuk riwayat di board Task dan hitungan keterlambatan.
ALTER TABLE fpa_submissions
  MODIFY status_dokumen ENUM('Draft', 'Diajukan', 'Diverifikasi', 'Disetujui', 'Ditolak', 'Revisi', 'Selesai') DEFAULT 'Draft',
  ADD COLUMN tanggal_selesai DATE NULL AFTER status_dokumen;
ALTER TABLE fpa_a_submissions
  MODIFY status_dokumen ENUM('Draft', 'Diajukan', 'Disetujui', 'Ditolak', 'Revisi', 'Selesai') DEFAULT 'Draft',
  ADD COLUMN tanggal_selesai DATE NULL AFTER status_dokumen;

-- Batas pengujian per item, dikunci saat Developer mencentang Dev:
--   test_due_days    = batas (hari kerja) yang berlaku saat dicentang
--   test_due_at      = lewat waktu ini tanpa respons pemohon -> dianggap sudah ditest (cron)
--   test_remind_at   = pengingat ke pemohon 1 hari kerja sebelumnya (NULL kalau batasnya 1 hari)
--   test_reminded_at = pengingat sudah dimasukkan ke antrean email
--   dev_notified_at  = item sudah masuk email harian "item siap dites" ke pemohon
-- Item yang sudah dicentang Dev saat migrasi ini dijalankan (test_due_at NULL) dihitung oleh cron
-- sejak pertama kali cron berjalan.
ALTER TABLE submission_checklist_items
  ADD COLUMN test_due_days TINYINT UNSIGNED NULL AFTER dev_done_at,
  ADD COLUMN test_due_at DATETIME NULL AFTER test_due_days,
  ADD COLUMN test_remind_at DATETIME NULL AFTER test_due_at,
  ADD COLUMN test_reminded_at DATETIME NULL AFTER test_remind_at,
  ADD COLUMN dev_notified_at DATETIME NULL AFTER test_reminded_at,
  ADD KEY test_due (test_due_at);

-- Batas kirim revisi FPA-A (hari kerja), dikunci saat dokumen dikembalikan untuk revisi. Lewat
-- batas -> FPA-A ditolak otomatis. FPA tidak memakai batas ini. FPA-A yang sudah berstatus Revisi
-- saat migrasi ini dijalankan (revision_due_at NULL) dihitung oleh cron sejak pertama kali berjalan.
ALTER TABLE approval_runs
  ADD COLUMN revision_due_days TINYINT UNSIGNED NULL AFTER project_id,
  ADD COLUMN revision_due_at DATETIME NULL AFTER revision_due_days,
  ADD COLUMN revision_remind_at DATETIME NULL AFTER revision_due_at,
  ADD COLUMN revision_reminded_at DATETIME NULL AFTER revision_remind_at;

-- Pengaturan di app_settings (diubah Admin di menu Users), tidak ada baris = 7 hari kerja:
--   batas_pengujian   = batas pemohon menguji item setelah dicentang Dev
--   batas_revisi_fpaa = batas pemohon mengirim ulang FPA-A yang dikembalikan untuk revisi

-- Dokumen lama: Disetujui dan semua itemnya sudah ditest -> langsung Selesai, tanggalnya dari item
-- terakhir yang ditest. Tanpa email. FPA-A dulu, karena FPA menunggu FPA-A-nya.
UPDATE fpa_a_submissions d
SET d.status_dokumen = 'Selesai',
    d.tanggal_selesai = (SELECT DATE(MAX(c.user_tested_at)) FROM submission_checklist_items c WHERE c.document_type = 'fpaa' AND c.document_id = d.id)
WHERE d.status_dokumen = 'Disetujui'
  AND EXISTS (SELECT 1 FROM submission_checklist_items c WHERE c.document_type = 'fpaa' AND c.document_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM submission_checklist_items c WHERE c.document_type = 'fpaa' AND c.document_id = d.id AND c.user_tested_at IS NULL);

UPDATE fpa_submissions d
SET d.status_dokumen = 'Selesai',
    d.tanggal_selesai = GREATEST(
      (SELECT DATE(MAX(c.user_tested_at)) FROM submission_checklist_items c WHERE c.document_type = 'fpa' AND c.document_id = d.id),
      COALESCE((SELECT MAX(a.tanggal_selesai) FROM fpa_a_submissions a WHERE a.nomor_fpa_utama = d.nomor_fpa AND a.status_dokumen = 'Selesai'), '1000-01-01'))
WHERE d.status_dokumen = 'Disetujui'
  AND EXISTS (SELECT 1 FROM submission_checklist_items c WHERE c.document_type = 'fpa' AND c.document_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM submission_checklist_items c WHERE c.document_type = 'fpa' AND c.document_id = d.id AND c.user_tested_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM fpa_a_submissions a WHERE a.nomor_fpa_utama = d.nomor_fpa AND a.status_dokumen IN ('Diajukan', 'Disetujui', 'Revisi'));

-- Project otomatis dari dokumen yang selesai.
UPDATE projects p
  JOIN approval_runs r ON r.project_id = p.id
  JOIN fpa_submissions d ON r.document_type = 'fpa' AND d.id = r.document_id
SET p.status = 'Completed', p.end_date = d.tanggal_selesai
WHERE d.status_dokumen = 'Selesai';
UPDATE projects p
  JOIN approval_runs r ON r.project_id = p.id
  JOIN fpa_a_submissions d ON r.document_type = 'fpaa' AND d.id = r.document_id
SET p.status = 'Completed', p.end_date = d.tanggal_selesai
WHERE d.status_dokumen = 'Selesai';

-- Dicatat di riwayat dokumen.
INSERT INTO approval_events (run_id, cycle, actor_id, actor_name, action, note)
SELECT r.id, r.cycle, NULL, 'Sistem (otomatis)', 'complete', 'Ditandai Selesai saat fitur status Selesai dipasang: semua item sudah ditest.'
FROM approval_runs r JOIN fpa_submissions d ON r.document_type = 'fpa' AND d.id = r.document_id
WHERE d.status_dokumen = 'Selesai';
INSERT INTO approval_events (run_id, cycle, actor_id, actor_name, action, note)
SELECT r.id, r.cycle, NULL, 'Sistem (otomatis)', 'complete', 'Ditandai Selesai saat fitur status Selesai dipasang: semua item sudah ditest.'
FROM approval_runs r JOIN fpa_a_submissions d ON r.document_type = 'fpaa' AND d.id = r.document_id
WHERE d.status_dokumen = 'Selesai';
