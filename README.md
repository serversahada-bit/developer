# IT PSLU Developer (Next.js)

Port dari aplikasi PHP `developer-main` ke Next.js 16 (App Router), dengan stack yang sama seperti absen-main dan ERPshd-main: Next.js 16, React 19, Tailwind 4, mysql2, dan jose. Database dan skemanya **tidak berubah**, sehingga versi PHP dan versi ini bisa berjalan berdampingan pada data yang sama selama masa transisi.

## Menjalankan

```powershell
npm install
copy .env.example .env.local   # lalu isi SESSION_SECRET dan sesuaikan DB
npm run dev                     # http://localhost:3000
npm run build; npm run start    # produksi
```

`.env.local` lokal sudah diarahkan ke `u313218767_dev` (aplikasi) dan `absensi` (tabel `karyawan`) di XAMPP.

## Struktur

| Lokasi | Isi |
|---|---|
| `src/proxy.ts` | Mengalihkan request tanpa cookie sesi yang valid ke `/login`. |
| `src/lib/db.ts` | Pool MySQL (`dateStrings`, zona waktu WIB per koneksi) dan helper transaksi. |
| `src/lib/session.ts`, `auth.ts` | Cookie sesi JWT (httpOnly), akun aktif, hak akses menu, login. |
| `src/lib/identity.ts` | **Satu-satunya** pembaca database Absensi (tabel `karyawan`). |
| `src/lib/approval.ts`, `submission.ts`, `checklist.ts`, `email.ts` | Alur approval FPA/FPA-A, revisi, checklist, antrean email (port 1:1 dari PHP). |
| `src/lib/users.ts`, `menus.ts` | Manajemen user dan definisi menu. |
| `src/app/(app)/…` | Halaman dengan sidebar: Projects, Activity Log, My Tasks, Task, Calendar, Reports, Approvals, Users. |
| `src/app/(portal)/pengajuan/…` | Portal dan form FPA, FPA-A, FPM. |
| `src/app/sso`, `src/app/login`, `src/app/logout` | Masuk, keluar, dan penerima SSO dari Great. |
| `src/app/api/cron/approval-emails` | Pengiriman ulang antrean email (pengganti `send_approval_emails.php`). |

Semua mutasi memakai Server Actions. Next.js menolak action yang `Origin`-nya berbeda dengan host, sehingga setiap form, termasuk Activity Log dan Projects yang di PHP tidak memakai token CSRF, sekarang terlindungi.

## Peta URL dari versi PHP

| PHP | Next.js |
|---|---|
| `index` | `/activity` (halaman `/` mengarah ke menu pertama milik akun) |
| `my_tasks`, `create?id=` | `/my-tasks` (edit lewat modal) |
| `projects`, `project_detail?id=` | `/projects`, `/projects/[id]` |
| `tasks`, `calendar`, `reports`, `export_excel` | `/tasks`, `/calendar`, `/reports`, `/reports/export` |
| `approvals`, `approval_detail?type=&id=` | `/approvals`, `/approvals/[type]/[id]` |
| `pengajuan`, `fpa`, `fpa_a`, `fpm` | `/pengajuan`, `/pengajuan/fpa`, `/pengajuan/fpa-a`, `/pengajuan/fpm` |
| `users` | `/users` |

Tautan di email approval mengikuti `APP_BASE_URL` + `/approvals/[type]/[id]`.

## Perbedaan perilaku dari versi PHP

- Ubah status FPM (Tandai Diproses / Selesaikan) kini hanya untuk Admin. Di PHP, akun mana pun yang login bisa melakukannya.
- FPA-A "Input Manual..." kini memunculkan kolom nomor FPA. Di PHP opsi ini tersimpan sebagai teks `--manual--`.
- Form FPM menggabungkan "Lainnya" dengan pilihan lain. Di PHP, "Lainnya" diabaikan jika ada pilihan lain yang dicentang.
- Tombol centang selesai di My Tasks tidak lagi menghapus project pada task tersebut.
- Activity Log, Projects, dan input tanggal sekarang divalidasi di server. Project yang dibuat dari FPA yang disetujui tidak bisa dihapus (dilindungi foreign key) dan sekarang menampilkan pesan yang jelas.
- Logout memakai POST.

## SSO dari Great (absen-main)

Penerima: `GET /sso?token=<jwt>&next=/tasks`. Kontrak token:

- HS256, ditandatangani dengan `SSO_SECRET` (sama dengan Great, minimal 32 karakter).
- `aud: "developer"`. Token untuk ERP (tanpa `aud` ini) ditolak.
- `jti` unik; setiap token hanya bisa dipakai sekali.
- `exp` maksimal 120 detik setelah `iat`.
- `user_id` = `karyawan.id`, sama dengan `users.karyawan_id`.

Setelah token valid, status karyawan dicek ulang di Absensi (Non-Aktif ditolak), lalu dicari akun Developer yang terhubung.

Contoh route pengirim di Great (`src/app/api/auth/sso-developer/route.ts`), mengikuti pola `sso-erp`:

```ts
const token = await new SignJWT({ user_id: session.user_id })
  .setProtectedHeader({ alg: "HS256" })
  .setAudience("developer")
  .setJti(crypto.randomUUID())
  .setIssuedAt()
  .setExpirationTime("60s")
  .sign(new TextEncoder().encode(process.env.SSO_SECRET));
return NextResponse.redirect(`${process.env.DEVELOPER_URL}/sso?token=${token}`, { headers: { "Cache-Control": "no-store" } });
```

Penanda `jti` disimpan di memori proses. Untuk lebih dari satu instance server, pindahkan ke tabel atau Redis.

## Rencana: akun dari tabel `karyawan`

Saat ini akun tetap berada di tabel `users`, karena seluruh foreign key riwayat (approval, pengajuan, checklist) merujuk `users.id`. Tabel `users` sudah berfungsi sebagai pemetaan `karyawan_id` → jabatan, divisi, menu, dan email notifikasi. Langkah memindahkan sumber akun ke `karyawan`:

1. Nama, email, dan status dibaca dari `karyawan` lewat `src/lib/identity.ts`, bukan dari `users.full_name` dan `users.email`.
2. Pembuatan akun di menu Users menjadi "aktifkan karyawan ini di Developer" (memilih jabatan, divisi, menu).
3. Kolom `users.full_name`, `username`, `password_hash` dipensiunkan setelah tidak ada akun lokal yang tersisa.

## Email

Isi `MAIL_*` di `.env.local` dan set `MAIL_ENABLED=true`. Kirim ulang antrean secara terjadwal:

```powershell
curl -X POST -H "Authorization: Bearer $env:CRON_SECRET" http://localhost:3000/api/cron/approval-emails
```
