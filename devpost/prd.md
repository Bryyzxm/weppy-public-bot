---
doc: prd
status: draft
---

# Asisten Sales B2B — Product Requirements

Asisten sales B2B publik di Telegram yang mengubah voice note/teks setelah kunjungan menjadi catatan pipeline pribadi, lalu membantu follow-up dan rekap harian.
Source: `scope.md > The Unique Kernel`, `scope.md > The Core Loop`, `scope.md > What "Working" Looks Like`, `scope.md > The POC Boundary`.

## The Core Journey

1. Pengguna membuka bot Telegram publik dan mengirim `/start` atau sapaan.
2. Untuk pengguna baru, agent melakukan onboarding singkat: nama panggilan, bahasa (Indonesia/Inggris), jam rekap sore. Setiap pertanyaan dapat di-skip.
3. Pengguna mengirim laporan kunjungan melalui teks atau voice note.
4. Agent mentranskripsi suara bila perlu, mengekstrak empat informasi pipeline, lalu membalas kartu teks. Field yang tidak disebut tetap kosong.
5. Jika field kurang, agent menanyakannya satu per satu; pengguna dapat menjawab atau memilih Skip. Catatan pribadi disimpan setelahnya.
6. Pengguna meminta rekap, follow-up, detail catatan, atau CSV. Agent hanya menggunakan catatan akun Telegram peminta.
7. Pada waktu yang dipilih, agent mengirim rekap dan pengingat yang relevan ke masing-masing pengguna.

## Screens and Layout

Dua permukaan yang memakai satu percakapan yang sama: thread chat Telegram per pengguna, dan aplikasi web publik yang dapat dibuka siapa pun di browser.

- **Telegram:** histori mengikuti perilaku bawaan Telegram; agent membalas pesan, voice note, dan tombol inline. Kartu laporan berupa pesan teks dengan empat field, status lengkap/belum, tanggal follow-up, dan instruksi melengkapi.
- **Web (`/`):** halaman arahan yang menjelaskan produk dan menautkan ke `/app` serta bot Telegram.
- **Web (`/app`):** permukaan chat satu kolom dengan kartu catatan, tombol aksi inline, aksi cepat, perekam voice note di browser, serta panel samping pipeline berisi profil, statistik (catatan/draf/jatuh tempo), daftar catatan, ekspor CSV, dan dialog pengaturan. Pada layar sempit panel samping menjadi laci yang dibuka lewat tombol.
- Tombol menu, Skip, pemilihan tahap, detail rekap, dan ekspor tetap berada di percakapan pada kedua permukaan.
- Tidak ada akun, daftar terpisah, atau webview Telegram. Sesi web memakai token acak di `localStorage` yang dipetakan ke pemilik `web:<token>` di D1, terpisah dari `chat_id` Telegram.
- `chat_id` Telegram dan token sesi web menetapkan batas kepemilikan: data pengguna lain tidak boleh dibaca, diubah, ditampilkan, atau diekspor.

## Look and Feel

- Nada singkat, praktis, membantu; bukan formulir CRM. Source: `scope.md > Inspiration & Identity`.
- Proaktif saat informasi kurang, tetapi selalu menawarkan Skip.
- Kartu mudah dipindai; nilai yang tidak disebut tidak dikarang.
- Bahasa Indonesia/Inggris mengikuti pilihan profil dan dapat diganti lewat chat atau dialog pengaturan web.
- Web memakai satu sistem warna hijau netral, mendukung mode gelap sistem, target sentuh ≥ 32px, dan menghormati `prefers-reduced-motion`.

## Features and Behavior

### 0. Onboarding per pengguna

- [ ] Pesan pertama dari akun baru memulai onboarding nama, bahasa pilihan, dan jam rekap, satu per satu.
- [ ] Semua pertanyaan dapat di-skip; default bahasa Indonesia dan jam 17:00 waktu Asia/Jakarta.
- [ ] Profil tersimpan untuk `chat_id` tersebut dan tidak berbagi dengan akun lain.
- [ ] Perintah ubah nama, bahasa, dan jam hanya mengubah profil peminta.

### 1. Sapaan dan bantuan

- [ ] `halo`/`/start` memberi sambutan, nama bila tersedia, panduan dan menu.
- [ ] Sapaan atau perintah melihat rekap hanya memakai catatan akun yang mengirimnya.
- [ ] Akun baru tanpa catatan melihat keadaan kosong yang jelas; tidak ada informasi pengguna lain.

### 2. Kirim laporan teks atau voice note

- [ ] Pengguna dapat mengirim teks bebas atau voice note.
- [ ] Voice note Telegram diunduh dan ditranskripsi sebelum diproses sebagai laporan teks.
- [ ] Jika unduh/transkripsi gagal atau hasil tidak jelas, agent meminta pengiriman ulang atau teks; catatan palsu tidak dibuat.
- [ ] Pesan laporan dan callback diproses dengan pemilik `chat_id` yang benar.

### 3. Kartu laporan hasil ekstraksi

- [ ] Kartu menunjukkan institusi/perusahaan, kontak + peran, produk/layanan, dan tahap deal.
- [ ] Kartu menampilkan nilai yang ditemukan serta `Belum ada` untuk field yang hilang, tanpa mengarang.
- [ ] Tanggal follow-up ditampilkan sebagai tanggal ringkas; tanggal tersimpan sebagai `YYYY-MM-DD`.
- [ ] Catatan dan status draf dimiliki akun yang mengirim laporan.

### 4. Klarifikasi dengan Skip

- [ ] Field kosong ditanyakan satu per satu, dengan tombol Skip dan alternatif ketik.
- [ ] Jawaban dan Skip hanya memperbarui draf akun yang menjawab.
- [ ] Setelah semua field dijawab/di-skip, catatan tersimpan dan agent mengonfirmasi.
- [ ] Draf yang masih menunggu klarifikasi bertahan setelah restart dan tidak dapat diteruskan akun lain.

### 5. Pengingat follow-up

- [ ] Agent menentukan tanggal follow-up dari isi laporan.
- [ ] `cek follow-up` menampilkan catatan milik pengguna dan tanggal yang jatuh tempo.
- [ ] Jadwal otomatis mengirim pengingat kepada pemilik catatan; tidak mengirim catatan pengguna lain.

### 6. Rekap pipeline

- [ ] `rekap sekarang` menampilkan ringkasan tahap deal dari catatan pengguna peminta saja.
- [ ] Detail rekap dan callback `view_<id>` hanya membuka catatan yang dimiliki peminta.
- [ ] Rekap harian dikirim pada jam profil masing-masing pengguna.
- [ ] Pengguna tanpa catatan menerima keadaan kosong yang jelas.

### 7. Pengaturan, menu, dan ekspor

- [ ] Menu dan balasan tersedia dalam Indonesia dan Inggris.
- [ ] `ekspor csv` atau tombol ekspor mengirim hanya catatan milik akun tersebut; ekspor kosong memberi pesan yang sesuai bahasa.
- [ ] Perintah dan tombol tidak dapat digunakan untuk membaca/mengubah data pengguna lain.

### 8. Persistensi dan operasi layanan publik

- [ ] Profil, catatan, draf, jadwal kirim, dan deduplikasi Telegram update bertahan setelah restart/redeploy.
- [ ] Bot tersedia melalui username publik tanpa allowlist.
- [ ] Layanan gratis beroperasi best-effort: gangguan platform, kuota, atau batas API dapat menunda/menghentikan layanan; tidak ada SLA.
- [ ] Owner dapat memeriksa statistik agregat melalui endpoint admin dengan bearer secret: pengguna aktif berarti interaksi chat privat dalam lima menit terakhir; total berarti ID Telegram berbeda yang memiliki profil atau aktivitas tercatat. Endpoint tidak mengungkap ID atau profil.
- [ ] UI/README tidak menjanjikan uptime, backup, atau kapasitas yang tidak tersedia.

## States and Boundaries

- **First use / empty** — Pengguna baru mendapat sambutan dan onboarding personal.
- **Normal** — Sapaan, rekap, pengingat, detail, dan ekspor berisi catatan pemilik saja.
- **Partial report** — Field kosong ditampilkan apa adanya dan dapat dilengkapi atau di-skip.
- **Unclear audio** — Agent meminta teks/rekaman ulang; tidak menyimpan data karangan.
- **Pending clarification** — Draf tersimpan dan hanya pemiliknya yang dapat melanjutkan.
- **Persists** — Profil, catatan, draf dan update dedupe bertahan di database D1 setelah restart/deploy.
- **Isolation boundary** — Telegram `chat_id` dan token sesi web adalah pemilik profil, catatan, draf, rekap, detail dan CSV. Tidak ada berbagi atau akses tim.
- **Public best-effort service** — Bot dan web terbuka untuk dicoba, tetapi kuota Worker/D1/API atau gangguan provider dapat membuatnya tidak tersedia sementara.
- **Out of scope** — Telegram group chat, WhatsApp, dashboard analitik, akses tim, dan SLA produksi.

## Product Decisions

- Telegram dan aplikasi web adalah dua transport pada satu layanan publik; keduanya memanggil mesin percakapan yang sama (`src/chat.ts`).
- Satu bot dan satu Worker melayani banyak akun, dengan profil/catatan terpisah berdasarkan `chat_id` Telegram atau token sesi web.
- Data tersimpan terpusat dan persisten di Cloudflare D1; tidak menggunakan JSON lokal untuk layanan publik.
- Cloudflare Workers + D1 dipilih untuk menghindari server/VM yang meminta kartu. POC memakai Worker berbasis TypeScript; Python prototype tetap sebagai demo lokal. Batas gratis berlaku; layanan best-effort.
- Ekstraksi dan transkripsi memakai Groq API; batas kuota Groq berlaku dan API key disimpan sebagai secret deployment.
- Jam rekap mengikuti `Asia/Jakarta`; default 17:00 dan bahasa Indonesia.
- Sesi web disimpan di `localStorage` browser dan tidak dapat memicu push terjadwal; pengingat otomatis tetap jalur Telegram.

## What We're Building

1. Bot Telegram publik dengan onboarding per pengguna.
2. Aplikasi web publik yang menjalankan percakapan, kartu, klarifikasi, rekap, dan ekspor yang sama di browser.
3. Laporan teks/voice note → ekstraksi empat field → kartu tanpa data karangan.
4. Klarifikasi bertahap dengan Skip dan draf yang persisten.
5. Pengingat, rekap, tombol detail, menu, dan ekspor CSV yang dibatasi ke pemilik.
6. Penyimpanan profil/catatan/dedupe di D1 setelah restart/redeploy.
7. Setup deploy gratis best-effort dan peringatan kuota/ketersediaan yang jujur.

## Deferred From the POC

- Dashboard analitik, fitur tim/berbagi, integrasi CRM, sinkronisasi kalender, multi-channel, atau aturan follow-up kompleks.
- SLA, redundansi failover, backup terkelola, dan operasi on-call.

## Non-Goals

- Sistem CRM lengkap, lead scoring, rekomendasi harga/prediksi closing.
- SLA produksi atau uptime tanpa gangguan.
- Jalur WhatsApp dan akses grup Telegram.
- Akun pengguna, kata sandi, atau sinkronisasi lintas perangkat untuk sesi web.

## Open Questions

- Identitas/username bot dan akun Cloudflare untuk deployment diisi langsung oleh pemilik; jangan menyimpan token atau secrets di repo.
- Batas penggunaan gratis Worker, D1, dan Groq dapat berubah; periksa dashboard/provider sebelum publikasi.
