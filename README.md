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

## Catatan operasional

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
