-- Batas waktu approval FPA / FPA-A per tahap (hari kerja), dengan pengingat dan keputusan otomatis.
-- Jalankan sekali di database Developer (DB_NAME) sebelum deploy versi yang memakainya.

-- Dihitung saat tahap dibuka (atau saat Manager dialihkan Admin) dan tidak berubah sesudahnya.
--   due_days     = batas dalam hari kerja yang berlaku saat tahap dibuka
--   due_at       = lewat waktu ini tanpa keputusan -> diputuskan sistem (cron)
--   remind_at    = pengingat 1 hari kerja sebelum due_at (NULL kalau batasnya 1 hari)
--   reminded_at  = pengingat sudah dimasukkan ke antrean email
--   auto_decided = 1 kalau keputusan tahap ini diambil sistem
-- Tahap yang sudah menunggu saat migrasi ini dijalankan (due_at NULL) dihitung oleh cron sejak
-- pertama kali cron berjalan. Tahap jalur lama (stage NULL) tidak memakai batas waktu.
ALTER TABLE approval_steps
  ADD COLUMN due_days TINYINT UNSIGNED NULL AFTER acted_at,
  ADD COLUMN due_at DATETIME NULL AFTER due_days,
  ADD COLUMN remind_at DATETIME NULL AFTER due_at,
  ADD COLUMN reminded_at DATETIME NULL AFTER remind_at,
  ADD COLUMN auto_decided TINYINT(1) NOT NULL DEFAULT 0 AFTER reminded_at,
  ADD KEY step_due (state, due_at);

-- Keputusan dan pengingat dari sistem dicatat tanpa akun (actor_name = 'Sistem (otomatis)').
ALTER TABLE approval_events MODIFY actor_id INT UNSIGNED NULL;

-- Pengaturan batas waktu disimpan di app_settings (key batas_approval), contoh:
--   atasan=2,tim_it=2,manager_it=3,manager_fat=4
-- Tidak ada baris = nilai default di atas.
