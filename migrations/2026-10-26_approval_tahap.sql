-- Alur approval FPA / FPA-A bertahap: Atasan langsung -> Tim IT -> Manager IT -> Manager FAT.
-- Jalankan sekali di database Developer (DB_NAME) sebelum deploy versi yang memakainya.

-- Manager IT dan Manager FAT ditunjuk Admin di menu Users, satu orang per peran.
CREATE TABLE IF NOT EXISTS approval_roles (
  role_key ENUM('manager_it', 'manager_fat') NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (role_key),
  KEY user_id (user_id),
  CONSTRAINT approval_roles_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- stage NULL = tahap dari jalur lama (approval_routes). Tahap Tim IT dipegang kelompok, jadi
-- approver_id kosong sampai salah satu anggotanya memutuskan.
ALTER TABLE approval_steps
  ADD COLUMN stage ENUM('atasan', 'tim_it', 'manager_it', 'manager_fat') NULL AFTER position,
  MODIFY approver_id INT UNSIGNED NULL;

-- Koreksi budget oleh Tim IT / Manager IT. Nilai asli pemohon tetap di kolom aslinya.
ALTER TABLE fpa_submissions ADD COLUMN estimasi_biaya_admin DECIMAL(15,2) NULL AFTER estimasi_biaya;
ALTER TABLE fpa_a_submissions ADD COLUMN tambahan_biaya_admin DECIMAL(15,2) NULL AFTER tambahan_biaya;

-- Satu kejadian (approval_events) bisa mengirim email ke banyak penerima.
-- kind 'turn' = minta keputusan (dicek ulang gilirannya), 'info' = pemberitahuan.
ALTER TABLE approval_email_queue
  ADD COLUMN event_id INT UNSIGNED NULL AFTER run_id,
  ADD COLUMN kind ENUM('turn', 'info') NOT NULL DEFAULT 'turn' AFTER event_id,
  ADD KEY run_id (run_id),
  ADD CONSTRAINT approval_email_queue_event FOREIGN KEY (event_id) REFERENCES approval_events (id);
ALTER TABLE approval_email_queue
  DROP INDEX approval_email_turn,
  ADD UNIQUE KEY approval_email_once (event_id, recipient_id);
