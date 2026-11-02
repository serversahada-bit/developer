-- Jabatan Staff (hanya boleh mengajukan FPM) dan email notifikasi FPM.
-- Jalankan sekali di database Developer (DB_NAME) sebelum deploy versi yang memakainya.

ALTER TABLE users
  MODIFY role ENUM('Manager', 'SPV', 'Koordinator', 'Staff', 'Admin') NOT NULL;

-- FPM tidak punya jalur approval, jadi emailnya punya antrean sendiri. Diproses oleh cron yang
-- sama dengan email approval (/api/cron/approval-emails).
--   submitted  = laporan baru, ke semua anggota Tim IT
--   processing = mulai diproses, ke pelapor
--   closed     = selesai, ke pelapor
CREATE TABLE IF NOT EXISTS fpm_email_queue (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  fpm_id INT NOT NULL,
  event ENUM('submitted', 'processing', 'closed') NOT NULL,
  recipient_id INT UNSIGNED NOT NULL,
  recipient_email VARCHAR(254) NULL,
  status ENUM('pending', 'sent', 'skipped') NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  last_error VARCHAR(255) NULL,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY fpm_email_once (fpm_id, event, recipient_id),
  KEY email_due (status, next_attempt_at),
  KEY recipient_id (recipient_id),
  CONSTRAINT fpm_email_queue_fpm FOREIGN KEY (fpm_id) REFERENCES fpm_submissions (id) ON DELETE CASCADE,
  CONSTRAINT fpm_email_queue_user FOREIGN KEY (recipient_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
