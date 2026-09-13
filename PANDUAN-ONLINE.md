# Cara Membuat JobPilot Online (5 Langkah)

Aplikasi sudah 100% siap. Kode, konfigurasi, dan koneksi database sudah saya bereskan.
Yang tersisa hanya bagian yang **wajib pakai akun Anda sendiri** (saya tidak bisa login atas nama Anda).
Semua layanan di bawah **GRATIS** untuk pemakaian pribadi.

Setelah selesai, Anda dapat 1 link seperti `https://jobpilot-anda.vercel.app` yang bisa dibuka di HP/laptop mana saja.

---

## Langkah 1 — Buat database di Supabase (± 3 menit)

1. Buka [supabase.com](https://supabase.com) → **Start your project** → daftar (bisa pakai akun GitHub/Google).
2. Klik **New Project**. Isi nama (misal `jobpilot`), buat **Database Password** (catat!), pilih region terdekat (Singapore). Klik **Create**.
3. Tunggu ± 2 menit sampai project siap.
4. Buka **Project Settings** (ikon gerigi) → **Database** → bagian **Connection string** → tab **URI**.
   - Salin string yang portnya **6543** (pooler) → ini `DATABASE_URL`.
   - Salin string yang portnya **5432** (direct) → ini `DIRECT_URL`.
   - Ganti `[YOUR-PASSWORD]` di kedua string dengan password dari langkah 2.

## Langkah 2 — Buat tempat penyimpanan CV di Supabase (± 1 menit)

1. Di Supabase, menu kiri → **Storage** → **New bucket**.
2. Nama bucket: **`cvs`** (huruf kecil). **Public: OFF** (biarkan private). Klik **Create**.
3. Menu kiri → **Project Settings** → **API**:
   - Salin **Project URL** → ini `SUPABASE_URL`.
   - Salin **service_role** key (yang panjang, "secret") → ini `SUPABASE_SERVICE_ROLE_KEY`.

## Langkah 3 — Unggah kode ke GitHub (± 3 menit)

1. Buka [github.com](https://github.com) → daftar kalau belum punya.
2. Klik **New repository** → nama `jobpilot` → **Private** → **Create repository**.
3. GitHub menampilkan perintah "…or push an existing repository". Di komputer ini, jalankan
   di folder `jobpilot` (ganti URL sesuai repo Anda):
   ```
   git remote add origin https://github.com/USERNAME-ANDA/jobpilot.git
   git branch -M main
   git push -u origin main
   ```
   (Kalau diminta login, ikuti petunjuk GitHub — biasanya lewat browser.)

## Langkah 4 — Deploy di Vercel (± 3 menit)

1. Buka [vercel.com](https://vercel.com) → **Sign up** → pilih **Continue with GitHub**.
2. **Add New… → Project** → pilih repo `jobpilot` → **Import**.
3. Sebelum klik Deploy, buka **Environment Variables** dan isi (dari langkah 1 & 2):

   | Name | Value |
   |------|-------|
   | `DATABASE_URL` | (string port 6543 dari Supabase) |
   | `DIRECT_URL` | (string port 5432 dari Supabase) |
   | `AUTH_SECRET` | teks acak panjang bebas (min 32 karakter) |
   | `NEXTAUTH_URL` | kosongkan dulu, isi setelah langkah 5 |
   | `SUPABASE_URL` | (Project URL) |
   | `SUPABASE_SERVICE_ROLE_KEY` | (service_role key) |
   | `SUPABASE_STORAGE_BUCKET` | `cvs` |

4. Klik **Deploy**. Tunggu ± 2 menit. Tabel database dibuat otomatis saat proses ini.

## Langkah 5 — Selesai & finalisasi (± 1 menit)

1. Vercel memberi link, misal `https://jobpilot-anda.vercel.app`. **Salin link itu.**
2. Kembali ke Vercel → **Settings → Environment Variables** → isi `NEXTAUTH_URL` dengan link tadi → **Save**.
3. **Deployments → ⋯ → Redeploy** (sekali, agar `NEXTAUTH_URL` terbaca).
4. Buka link Anda → klik **Create one** → daftar akun → mulai pakai. 🎉

---

### Catatan
- **Data demo tidak ikut** ke server online (itu hanya untuk latihan di komputer). Di server, Anda daftar akun baru dan mulai dari data kosong — memang seharusnya begitu.
- Kalau ada langkah yang membingungkan, kirim screenshot-nya ke saya, saya bantu.
