-- FPA memakai Estimasi Tanggal Selesai (bukan lagi jumlah hari) dan hari kerja yang diatur Admin.
-- Jalankan sekali di database Developer (DB_NAME) sebelum deploy versi yang memakainya.

-- Tanggal dari pemohon dan koreksi Admin. Dokumen lama tetap memakai estimasi_durasi(_admin).
ALTER TABLE fpa_submissions
  ADD COLUMN estimasi_selesai DATE NULL AFTER estimasi_durasi_admin,
  ADD COLUMN estimasi_selesai_admin DATE NULL AFTER estimasi_selesai;

-- Pengaturan aplikasi yang diubah Admin di menu Users.
--   hari_kerja = hari kerja, 0 = Minggu .. 6 = Sabtu, dipisah koma. Tidak ada baris = Senin-Sabtu.
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(64) NOT NULL,
  setting_value VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
