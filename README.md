# Asisten Sales WhatsApp B2B

Asisten WhatsApp untuk sales B2B: voice note/teks setelah kunjungan
jadi catatan pipeline rapi, plus pengingat follow-up dan rekap harian.

## Cara jalan (lokal)

1. `python3.12 -m venv .venv && ./.venv/bin/pip install -r requirements.txt`
2. Salin `.env.example` ke `.env`, isi token.
3. `./.venv/bin/python app.py` (jalan di `http://localhost:5000`,
   penjadwal rekap + follow-up ikut nyala di proses yang sama)
4. Di terminal lain: `ngrok http 5000`, tempel URL ke dashboard
   Meta Developer → WhatsApp → Configuration:
   Callback URL `https://xxx.ngrok-free.app/webhook`,
   Verify Token sama dengan `.env`, subscribe field `messages`.
5. Kirim `ping` dari WA uji → harus dibalas `pong`. Kalau log diam,
   masalahnya di tunnel/Callback URL, bukan di AI.

## Alur demo (untuk rekaman)

1. Kirim voice note berantakan → kartu teks rapi muncul
   (field tak disebut = `Belum ada`, bukan karangan).
2. Jawab pertanyaan klarifikasi / kirim `Skip` → konfirmasi tersimpan.
3. Ketik `cek follow-up` → pengingat yang jatuh tempo.
4. Ketik `rekap sekarang` → rekap per tahap deal + follow-up besok.
5. Tunjukkan `data/notes.json` terbuka sebagai bukti tersimpan.

Perintah lain: `halo` (sapaan + rekap terakhir), `ubah nama ke X`,
`ganti ke bahasa Inggris`, `ubah jam rekap ke 17:00`,
`laporan baru ...` (mulai laporan baru saat klarifikasi berjalan).

## Jalur Twilio sandbox (alternatif tanpa verifikasi bisnis)

1. Daftar trial di twilio.com/try-twilio (gratis, tanpa kartu kredit).
2. Buka Twilio Console lama → Messaging → Try WhatsApp (sandbox),
   catat kode join, mis. `join-ab12cd`.
3. Dari HP kirim `join-ab12cd` ke **+14155238886** (nomor sandbox).
4. Di pengaturan sandbox isi webhook: `https://xxx/event... (.trycloudflare.com)/twilio/inbound`
   (method POST). Tunnel yang sama seperti jalur Meta.
5. `.env`: `WHATSAPP_BACKEND=twilio` + `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886`.
6. Restart `python app.py`, kirim `ping` dari HP → dibalas `pong`.

Catatan: sesi join kedaluwarsa tiap 3 hari (join ulang); tombol
Skip tampil sebagai teks biasa (bukan tombol) di jalur ini; nomor
sandbox bersama kadang dibatasi ke negara tertentu — jika gagal,
hubungi Twilio Support atau kembali ke simulasi.

## Jalur 360dialog sandbox (tanpa daftar akun)

1. Dari HP kirim `START` (huruf besar semua) via WhatsApp ke **+551146733492**.
   Balasannya berisi API key sandbox.
2. `.env`: `WHATSAPP_BACKEND=d360` + `D360_API_KEY=<key dari WA>`.
3. Set webhook sandbox ke tunnel: (ganti URL + key)
   `curl -X POST https://waba-sandbox.360dialog.io/v1/configs/webhook -H 'Content-Type: application/json' -H 'D360-API-KEY: KEY_KAMU' -d '{"url": "https://xxx/event... (.trycloudflare.com)/webhook"}'`
4. Restart `python app.py`, kirim `ping` dari HP ke +551146733492.

Catatan: gratis 200 pesan ke nomor sendiri (cukup untuk POC);
**voice note tidak didukung** (sandbox tak sediakan unduh media) —
agent menjawab terus-terang dan meminta ketik teks.

## Jalur Fonnte (nomor WA sendiri)

1. Daftar di fonnte.com, tambah device (nomor WA yang jadi bot),
   connect via QR, salin token.
2. `.env`: `WHATSAPP_BACKEND=fonnte` + `FONNTE_TOKEN=<token>`.
3. Di pengaturan device Fonnte isi webhook:
   `https://xxx/event...(.trycloudflare.com)/fonnte/inbound`
   (method POST). Tunnel yang sama seperti jalur Meta.
4. Restart `python app.py`, kirim `ping` dari HP ke nomor device.

Catatan: nomor milik sendiri jadi bebas blokir negara; tombol Skip
tampil sebagai teks biasa (bukan tombol) di jalur ini; voice note
diunduh dari `url` webhook lalu ditranskripsi Groq seperti biasa.

## Catatan operasional (jalur Meta)

- Token WhatsApp mode uji kedaluwarsa cepat (error 401 saat kirim):
  generate ulang di Meta Developer → update `.env` → restart `app.py`.
- URL ngrok gratis berubah tiap restart → update Callback URL tiap mulai ulang.
- Media voice note kedaluwarsa ~5 menit: selalu diunduh segera di webhook.
- Pesan otomatis di luar 24 jam butuh message template berstatus
  `APPROVED` (kategori Utility), satu `{{1}}` berisi ringkasan:
  `followup_reminder_id` / `daily_recap_id` (`id`),
  `followup_reminder_en` / `daily_recap_en` (`en_US`).
  Tanpa template, pengiriman otomatis gagal tercatat + diberi tahu
  saat sales chat berikutnya; demo pakai `rekap sekarang` /
  `cek follow-up` yang selalu dalam window 24 jam.
- Rekap otomatis dikirim tiap hari di jam `recap_time` (default 17:00,
  bisa diubah via chat); cek follow-up tiap jam 08:00.
