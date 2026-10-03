---
doc: prd
status: approved
---

# Asisten Sales WhatsApp B2B — Product Requirements

Asisten WhatsApp pribadi untuk sales B2B yang mengubah voice note/teks setelah kunjungan menjadi catatan pipeline yang rapi, lalu membantu follow-up dan rekap harian.
Source: `scope.md > The Unique Kernel`, `scope.md > The Core Loop`, `scope.md > What "Working" Looks Like`.

## The Core Journey

Jalur lengkap dari buka chat sampai rekap, cukup konkret untuk diperagakan di layar:

0. Saat pertama kali memakai, sales melewati onboarding singkat di chat: agent bertanya nama panggilan, bahasa pilihan (Indonesia/Inggris), dan jam rekap sore yang diinginkan agar terasa personal.
1. Sales membuka chat WhatsApp uji setelah kunjungan. Histori ditampilkan WhatsApp secara bawaan; jika sales menyapa/mengirim perintah, agent membalas dengan sapaan + nama dari onboarding + rekap terakhir.
2. Sales mengirim laporan kunjungan lewat voice note atau pesan teks yang menjelaskan klien yang baru didapat.
3. Agent membalas dengan kartu teks terformat di dalam chat, berisi 4 info inti dengan status terisi/belum lengkap (bukan Flows/webview).
4. Jika ada field yang kosong, agent bertanya lewat chat satu per satu dengan opsi **Skip**, sesuai `scope.md > The Core Loop`.
5. Setelah catatan tersimpan, agent menentukan tanggal follow-up dari isi laporan dan mengingatkan saat waktunya tiba.
6. Sore hari, sales menerima rekap pipeline harian berisi ringkasan per tahap deal + siapa yang perlu di-follow-up besok.
7. Keberhasilan = voice note tidak terstruktur berubah menjadi catatan rapi, dan sales tidak perlu mengisi CRM manual atau mengarang data (sesuai `scope.md > What "Working" Looks Like`).

## Screens and Layout

Permukaan interaksi hanya satu: satu thread chat WhatsApp (satu sales, satu nomor uji), sesuai `scope.md > The POC Boundary`.

- **Thread chat utama:** tempat semua terjadi. Histori adalah riwayat bawaan WhatsApp (tidak dikontrol agent). Agent tidak bisa menyuntik tampilan saat chat dibuka; konteks ditampilkan sebagai balasan chat saat sales menyapa / mengirim perintah. Tengah = laporan baru + balasan agent, bawah = kolom kirim voice note/teks dan tombol cepat.
- **Kartu laporan teks:** dikirim sebagai pesan teks terformat di dalam chat (bukan layar web / bukan Flows). Berisi 4 field + status + tanggal follow-up + instruksi lanjut di chat. Tidak perlu diketuk-buka-tutup.
- **Tidak ada** dashboard web, daftar terpisah, Flows/webview, atau layar pengaturan di POC ini.
- Navigasi = scroll chat. Tidak ada menu antar-layar.

## Look and Feel

Untuk tool non-visual ini, yang ditetapkan adalah keterbacaan dan nada, bukan warna/font (tidak ditanya karena tidak relevan untuk chat WhatsApp — mengikuti gaya bawaan WhatsApp).

- Nada seperti chat WhatsApp yang singkat, praktis, dan membantu, bukan formulir CRM. Source: `scope.md > Inspiration & Identity`.
- Proaktif saat info kurang, tapi tidak menghambat: selalu ada opsi **Skip**.
- Kartu laporan mudah dipindai: 4 field diberi label jelas + penanda status (misalnya Terisi / Belum ada), yang belum ada tidak dikarang.
- Bahasa: Bahasa Indonesia dan Inggris, menyapa dengan nama panggilan setelah onboarding. Semua teks tetap agent (pertanyaan, label kartu, tombol Skip, pengingat, rekap) tersedia dalam kedua bahasa dan mengikuti bahasa pilihan sales.

## Features and Behavior

### 0. Onboarding personalisasi saat pertama pakai

Source: permintaan learner saat review PRD.

Apa yang terjadi: sebelum laporan pertama, agent mengenal sales agar sapaan dan rekap terasa personal.

- [ ] Pada pemakaian pertama, agent bertanya nama panggilan, bahasa pilihan (Indonesia/Inggris), dan jam rekap sore yang diinginkan, satu per satu lewat chat.
- [ ] Setiap pertanyaan onboarding bisa di-skip; jika bahasa di-skip dipakai Bahasa Indonesia, jika jam rekap di-skip dipakai default (asumsi: 17:00 waktu lokal); keduanya bisa diubah nanti via chat.
- [ ] Nama tersimpan dan dipakai untuk menyapa di histori, pengingat, dan rekap berikutnya.
- [ ] Jam rekap tersimpan per sales uji dan mengatur kapan rekap harian dikirim.

### 1. Histori dan rekap saat membuka chat

Source: jawaban learner + `scope.md > The Core Loop`.

Apa yang terjadi: sales yang membuka chat melihat riwayat bawaan WhatsApp. Konteks dari agent diberikan sebagai balasan chat, bukan suntikan tampilan.

- [ ] WhatsApp menampilkan histori bawaan secara otomatis; agent tidak mengontrol tampilan "saat dibuka" (tidak ada event on-open di Cloud API).
- [ ] Saat sales menyapa / mengirim perintah (mis. `halo`, `rekap sekarang`), agent membalas dengan sapaan memakai nama dari onboarding + rekap terakhir dari catatan tersimpan.
- [ ] Sales baru (pesan pertama masuk dan belum ada catatan/profil) memicu sambutan + onboarding singkat (nama, bahasa, jam rekap) + contoh laporan, bukan layar kosong yang membingungkan.

### 2. Kirim laporan kunjungan via voice note atau teks

Source: `scope.md > The Core Loop`, `scope.md > What "Working" Looks Like`.

- [ ] Sales dapat mengirim voice note atau pesan teks bebas yang menjelaskan klien hasil kunjungan.
- [ ] Agent menerima keduanya sebagai satu jenis laporan kunjungan yang sama: voice note diunduh cepat via Media ID (URL sementara ~5 menit) lalu ditranskripsi jadi teks, kemudian diproses sama seperti teks.
- [ ] Jika suara tidak jelas / transkripsi kosong, agent melakukan klarifikasi ke sales (minta bagian yang kurang jelas diulang) dan tidak mengarang isi laporan.

### 3. Kartu laporan teks dari agent

Source: jawaban learner + `scope.md > The Core Loop` (empat informasi inti).

Kartu ini adalah balasan utama agent setelah menerima laporan. Berupa pesan teks terformat di dalam chat (bukan Flows/webview), hanya untuk dibaca.

- [ ] Kartu menampilkan 4 field: institusi/perusahaan, contact person + role-nya, produk/layanan yang dibahas, tahap deal saat ini.
- [ ] Setiap field menunjukkan status: terisi (dengan nilainya) atau belum lengkap.
- [ ] Field yang belum ada dibiarkan kosong dengan penanda "belum ada" — tidak diisi karangan.
- [ ] Kartu menyertakan tanggal follow-up tebakan agent + cara lanjut di chat (misalnya instruksi "jawab di chat untuk melengkapi").
- [ ] Alasan bukan Flows: Flows butuh `flow_id`, `flow_token`, definisi screen, dan endpoint enkripsi/data-exchange — overkill untuk tampilan read-only dan menambah risiko demo. Keputusan ini dicatat di `spec.md > What Was Simplified and Why`.

### 4. Klarifikasi chat satu per satu dengan Skip

Source: `scope.md > The Core Loop` + keputusan learner (chat sebagai cara utama, bukan form).

- [ ] Untuk setiap field yang kosong, agent bertanya satu per satu lewat chat.
- [ ] Setiap pertanyaan menyertakan opsi **Skip** sebagai tombol quick-reply (batas Cloud API: maks 3 tombol per pesan, judul ≤20 karakter — `Skip` memenuhi).
- [ ] Jika sales memilih Skip (tombol atau ketik), field tetap kosong dan agent lanjut ke field berikutnya tanpa memaksa.
- [ ] Setelah semua terjawab atau di-skip, catatan disimpan dan agent memberi konfirmasi singkat.
- [ ] Cara kedua (edit langsung di Flows) secara eksplisit bukan bagian POC ini.

### 5. Pengingat follow-up dengan tanggal dari agent

Source: `scope.md > The Core Loop` + jawaban learner.

Batasan Cloud API: pesan bebas hanya bisa dikirim dalam 24 jam setelah pesan terakhir sales. Di luar itu wajib memakai message template yang sudah di-approve.

- [ ] Agent menentukan tanggal follow-up berdasarkan isi laporan (sales tidak perlu menyebut tanggal).
- [ ] Saat tanggal tiba, sales menerima pengingat di WhatsApp yang menyebut institusi + contact + hal yang perlu ditindaklanjuti.
- [ ] Jika masih dalam 24 jam: kirim sebagai pesan bebas. Jika di luar 24 jam: kirim sebagai template ter-approve sesuai bahasa profil (`id` atau `en_US`, nama + variabel `{{1}}` dst. didaftarkan di dashboard Meta).
- [ ] Tanggal yang ditentukan agent terlihat di catatan agar bisa dicek ulang (tampil `DD Mon YYYY` di chat, simpan `YYYY-MM-DD` di JSON).
- [ ] Untuk demo tanpa menunggu tanggal: perintah `cek follow-up` memanggil fungsi yang sama dengan penjadwal.

### 6. Rekap pipeline harian sore hari

Source: `scope.md > The Core Loop` + jawaban learner.

Batasan yang sama dengan pengingat: rekap otomatis sore hari hampir selalu di luar 24 jam, jadi wajib template kecuali sales baru saja chat.

- [ ] Setiap sore di jam rekap, sales menerima satu pesan rekap otomatis di WhatsApp.
- [ ] Rekap berisi ringkasan per tahap deal + daftar siapa yang perlu di-follow-up besok.
- [ ] Rekap hanya mencakup catatan yang tersimpan dari nomor uji ini.
- [ ] Implementasi: template rekap ter-approve sesuai bahasa profil (`id` / `en_US`) + variabel ringkasan; untuk demo instan ketik `rekap sekarang` (jalur bebas karena di dalam sesi aktif) memanggil fungsi yang sama.
- [ ] Jika template belum di-approve / di luar window tanpa template: pengiriman gagal — spec mengatur fallback pesan error + instruksi, bukan diam.

### 7. Dua bahasa (Indonesia dan Inggris)

Source: permintaan learner saat review PRD.

- [ ] Agent memahami laporan voice note/teks dalam Bahasa Indonesia maupun Inggris sebagai satu alur yang sama.
- [ ] Bahasa balasan mengikuti bahasa pilihan dari onboarding (default Indonesia jika di-skip).
- [ ] Sales dapat mengganti bahasa kapan saja via chat (misalnya "ganti ke bahasa Inggris" / "switch to Indonesian"); pilihan baru dipakai untuk balasan berikutnya.
- [ ] Label kartu, tombol Skip, pengingat follow-up, dan rekap tersedia dalam kedua bahasa.

## States and Boundaries

- **First use / empty** — Belum ada catatan dan belum onboarding: chat menampilkan sambutan + onboarding singkat (nama, jam rekap) + contoh voice note/teks yang bisa dikirim. Tidak ada error.
- **Normal** — Ada catatan: riwayat bawaan WhatsApp tetap ada; rekap terakhir diberikan agent saat sales menyapa/mengirim perintah, siap menerima laporan baru.
- **Partial report** — Laporan hanya menangkap sebagian 4 field: kartu menunjukkan bagian kosong sebagai "belum ada", lalu masuk ke klarifikasi chat dengan Skip.
- **Unclear audio** — Voice note tidak jelas: tidak dibuatkan kartu karangan; agent meminta klarifikasi bagian yang kurang jelas.
- **Skipped** — Sales memilih Skip: field tetap kosong, alur lanjut, catatan tetap disimpan sebagai parsial.
- **Persists** — Catatan pipeline (4 field + tanggal follow-up) tersimpan antar sesi dan muncul di histori/rekap berikutnya.
- **Disappears** — Status sementara (misalnya "sedang mendengarkan...") tidak perlu disimpan.
- **Boundary** — Satu sales, satu nomor uji (allowlist), mode uji coba Meta WhatsApp Cloud API. Pesan bebas hanya dalam 24 jam setelah pesan terakhir sales; di luar itu wajib template ter-approve. Media voice note via URL sementara (~5 menit, segera diunduh). Tidak ada akses tim atau banyak nomor.
- **Template-required** — Pengingat dan rekap otomatis di luar window tanpa template = gagal terkirim (bukan bug agent). POC mencakup 2 pasang template ter-approve (ID + EN: 1 pengingat + 1 rekap per bahasa), plus perintah demo `rekap sekarang` / `cek follow-up` yang berjalan di dalam window.

## Product Decisions

- Histori bawaan WhatsApp + balasan rekap saat disapa — karena Cloud API tidak punya event on-open; sales tetap langsung punya konteks tanpa menambah layar.
- Input sales tetap voice note/teks (voice → transkripsi → satu alur); kartu hanya teks terformat dari agent — menjaga kebiasaan lapangan yang cepat, tanpa biaya Flows.
- Isi kartu = 4 field inti dengan status terisi/belum — sesuai `scope.md > The Core Loop`, tanpa tambahan agar tetap kecil.
- Bukan Flows: Flows butuh Flow definition + `flow_token` + endpoint enkripsi/data-exchange — overkill untuk read-only dan berisiko makan 1–2 jam demo. Lihat `spec.md > What Was Simplified and Why`.
- Klarifikasi utama lewat chat satu per satu dengan Skip (quick-reply, maks 3 tombol, judul ≤20 karakter); edit langsung di Flows ditunda — agar POC cukup dalam 2–4 jam kerja aktif.
- Tanggal follow-up ditentukan agent dari isi laporan — mengurangi beban sales mengingat jadwal. Tampil `DD Mon YYYY`, simpan `YYYY-MM-DD`.
- Rekap sore = ringkasan per tahap deal + follow-up besok via template ter-approve (wajib di luar 24 jam) — fokus pada aksi berikutnya, bukan daftar mentah.
- Onboarding singkat (nama + bahasa + jam rekap) saat pertama pakai — agar agent terasa personal tanpa menambah layar baru.
- Dua bahasa dengan pilihan eksplisit saat onboarding (bukan deteksi otomatis per pesan) — agar perilaku mudah ditebak dan didemokan.
- Suara tidak jelas → klarifikasi, bukan karangan — menjaga kepercayaan catatan.

Asumsi (bukan keputusan learner): jika bahasa di-skip dipakai Bahasa Indonesia; jika jam rekap di-skip, dipakai default 17:00 waktu lokal; satu thread chat cukup untuk demo histori.

## What We're Building

Semua yang harus ada agar POC dinyatakan lengkap:

1. Onboarding singkat saat pertama pakai (nama panggilan + bahasa + jam rekap, semuanya bisa di-skip).
2. Thread chat uji: histori bawaan WhatsApp + balasan sapaan/rekap terakhir saat sales menyapa.
3. Penerimaan laporan via voice note (unduh cepat + transkripsi) dan teks sebagai satu alur yang sama.
4. Kartu laporan teks berisi 4 field dengan status terisi/belum, tanpa data karangan, tanpa Flows.
5. Klarifikasi chat satu per satu dengan quick-reply Skip dan penyimpanan catatan parsial.
6. Klarifikasi khusus saat audio tidak jelas.
7. Tanggal follow-up yang ditentukan agent + pengingat (bebas di dalam 24 jam, template di luar 24 jam) + perintah demo `cek follow-up`.
8. Rekap harian sore via template ter-approve: ringkasan per tahap deal + follow-up besok + perintah demo `rekap sekarang`.

## Deferred From the POC

- Edit langsung / form submit di Flows — ditunda agar fokus pada alur chat dengan Skip yang membuktikan ide inti.
- Akun banyak sales, banyak nomor, dan akses tim — di luar `scope.md > The POC Boundary`.
- Integrasi CRM produksi (Salesforce/HubSpot) — disebut di scope sebagai Later.
- Aturan follow-up kompleks dan sinkronisasi kalender — melebihi demo satu sales.

## Possible Later Enhancements

- Edit form di Flows sebagai alternatif chat, setelah alur Skip terbukti.
- Dashboard web dan analitik performa, sesuai scope Later.
- Sinkronisasi kalender dan notifikasi multi-channel, sesuai scope Later.

## Non-Goals

- Sistem CRM lengkap — tidak diperlukan untuk membuktikan workflow agent inti (dari `scope.md > Explicitly Cut`).
- Otomatisasi WhatsApp produksi untuk banyak pengguna — butuh operasi di luar POC (dari scope).
- Scoring lead, rekomendasi harga, prediksi closing — bukan masalah pencatatan yang dibuktikan (dari scope).
- Integrasi ke nomor WhatsApp pribadi via API tidak resmi — berisiko dan tidak perlu untuk demo (dari scope).
- Kartu laporan tidak menerima input laporan baru dan bukan Flows interaktif — input tetap voice note/teks agar alur tunggal.

## Open Questions

- Format tampilan tanggal follow-up — diputuskan: tampil `DD Mon YYYY` (mis. `04 Okt 2026`) di chat, simpan `YYYY-MM-DD` di JSON. Detail di `spec.md > Decisions and Open Issues`.
- Nama + parameter 4 template ID/EN pengingat/rekap yang didaftarkan di dashboard Meta — diputuskan saat build (contoh `followup_reminder_id` / `daily_recap_id`, `followup_reminder_en` / `daily_recap_en`), tidak memblokir approval PRD ini.
