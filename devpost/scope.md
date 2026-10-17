---
doc: scope
status: approved
---

# Asisten Sales B2B

Asisten Telegram publik untuk sales B2B yang mengubah voice note atau pesan teks setelah kunjungan menjadi catatan pipeline pribadi, lalu membantu follow-up dan rekap harian.

## The Unique Kernel

Sales cukup bercerita lewat voice note atau mengetik setelah kunjungan. Agent memahami isi laporan, menangkap data yang belum ada, menanyakan detail yang kurang, dan selalu memberi opsi **Skip** jika informasi belum pasti. Dengan begitu, sales tidak perlu mengisi CRM secara manual atau mengarang data yang belum diketahui.

## Who It's For

Sales B2B yang sering berpindah dari satu kunjungan klien ke kunjungan lain dan perlu mencatat hasil percakapan dengan cepat. Saat ini mereka berisiko menunda pencatatan, lupa detail, atau melewatkan follow-up karena administrasi dilakukan setelah aktivitas lapangan.

## The Core Loop

Pengguna mengirim voice note atau pesan teks setelah kunjungan melalui satu bot Telegram publik. Agent mengekstrak dan menyimpan empat informasi inti: **institusi/perusahaan, contact person beserta rolenya, produk/layanan yang dibahas, dan tahap deal saat ini**. Jika informasi belum lengkap, agent bertanya bertahap dan menawarkan Skip. Tiap akun Telegram hanya dapat melihat catatannya sendiri; setelah catatan tersimpan, agent membantu pengingat follow-up dan rekap pipeline.

## Inspiration & Identity

Interaksi harus terasa seperti chat Telegram yang singkat, praktis, dan membantu—bukan seperti mengisi formulir CRM. Agent proaktif saat menemukan informasi kurang, tetapi tidak menghambat pengguna ketika informasi memang belum diketahui.

## Why This Matters to the Learner

Proyek ini memberi kesempatan untuk memahami workflow dan cara kerja AI agent secara lebih dalam melalui kasus nyata: menerima input teks atau suara, mengekstrak informasi, mengelola percakapan klarifikasi, menyimpan state, dan menjalankan pengingat atau rekap otomatis.

## What "Working" Looks Like

Dalam bot Telegram publik, pengguna memulai dengan `/start`, mengirim teks atau voice note, lalu agent membalas dengan kartu pipeline, meminta detail yang kurang dengan opsi Skip, dan menyimpan catatan pribadi yang hanya terlihat oleh akun tersebut. Pengguna dapat meminta rekap, detail, ekspor CSV, dan menerima pengingat. Layanan berjalan di hosting gratis best-effort; tidak ada uptime/SLA terjamin.

Momen “oh, ini berguna” adalah ketika voice note yang tidak terstruktur berubah menjadi catatan pipeline yang rapi, dan agent sendiri menemukan detail yang belum disebut tanpa memaksa sales mengisi data yang belum pasti.

## The POC Boundary

Yang termasuk:

- Agent tersedia lewat bot Telegram publik dengan username yang dapat dibagikan; pengguna dapat memulai sendiri tanpa allowlist.
- Setiap akun Telegram hanya dapat melihat dan mengubah profil serta catatan pipeline miliknya sendiri.
- Penerimaan laporan teks dan voice note, ekstraksi empat informasi inti, klarifikasi dengan Skip, penyimpanan catatan, pengingat follow-up, rekap, dan ekspor CSV.
- Bot berjalan di satu host gratis dengan target ketersediaan best-effort; hibernasi, pemeliharaan, kuota, dan gangguan layanan gratis dapat membuatnya sementara tidak tersedia.
- Data harus bertahan dari restart proses dan redeploy; kapasitas, backup, serta jaminan pemulihan tetap terbatas sesuai layanan gratis.

Hosting publik memungkinkan siapa pun mencoba bot, tetapi bukan SLA layanan produksi.

## Later

- Tim bersama, peran, dan berbagi catatan antar pengguna.
- Integrasi CRM produksi seperti Salesforce/HubSpot.
- Dashboard web dan analitik performa sales.
- Sinkronisasi kalender, notifikasi multi-channel, dan aturan follow-up kompleks.
- SLA, redundansi multi-region, monitoring on-call, serta pengelolaan volume tinggi.

## Explicitly Cut

- Sistem CRM lengkap: tidak diperlukan untuk membuktikan workflow agent inti.
- Catatan pipeline bersama lintas pengguna: data satu pengguna tidak boleh terlihat oleh pengguna lain.
- Scoring lead, rekomendasi harga, atau prediksi closing: bukan masalah pencatatan dan follow-up yang ingin dibuktikan.
