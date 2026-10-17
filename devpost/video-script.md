# Video demo — lembar adegan & skrip (EurekaDev 2026)

Batas aturan: **maksimal 4 menit**, wajib menjelaskan **problem, solution, how it works**. Target rekaman: **3:30** (jangan lebih dari 3:50).

- Format: 16:9, rekam 1440×900 atau 1920×1080, 30 fps.
- Bahasa: UI bot **English** + narasi **English** (juri internasional). Kalau lebih nyaman narasi Indonesia, tetap pakai lembar adegan ini dan bakar caption English di video.
- Unggah: YouTube **Unlisted** (atau Public), lalu tempel link di field *Video demo link*.

## Persiapan (30 menit sebelum rekam)

1. Pakai **akun Telegram demo**, jangan akun pribadi utama. Minimal: tutup semua chat lain sehingga layar hanya menampilkan chat Weppy.
2. Set bot ke English: `/start` → nama → 🇬🇧 English → 🕔 17:00.
3. **Data demo fiktif** (jangan data klien nyata): PT Sinar Abadi, Bu Rina, "paket langganan tahunan 50 user".
4. Matikan notifikasi (Focus), tutup aplikasi lain, sembunyikan Dock, zoom Telegram 100%.
5. Dry-run penuh sekali untuk memastikan voice note tertranskripsi (Groq hidup) dan kartu muncul.

## Papan adegan

| Waktu | Di layar | Aksi | Narasi (English) |
|---|---|---|---|
| 0:00–0:20 | Chat kosong / judul "Weppy" | — | "A sales visit ends. The customer agreed to a follow-up next week. By the time the salesperson reaches the next appointment, the details are gone — and the follow-up never happens. Not because salespeople are lazy: after a visit, filling a CRM form is the last thing anyone wants to do." |
| 0:20–0:35 | Bot dibuka | — | "Weppy fixes that with one thing every salesperson already uses: a voice note. Send one to this Telegram bot. It becomes a clean pipeline note — and Weppy asks for whatever is missing, so nothing gets invented." |
| 0:35–0:55 | `/start` → onboarding | Klik: nama → 🇬🇧 English → 🕔 17:00 | "Setup takes twenty seconds: a first name, a reply language, and the time for a daily recap." |
| 0:55–1:45 | **Inti demo** | Kirim voice note (lihat baris di bawah) → tunggu kartu → jawab pertanyaan tahap deal, klik 📌 Penawaran harga → pertanyaan role, klik ⏭️ Skip → "Note saved. 4 of 5 fields filled." | "Now the real test: a voice note, in Indonesian, straight after a visit. *(voice note plays)* Weppy transcribes it, extracts the company, the contact, the product and the deal stage, and replies with a structured card. It noticed two facts were missing. Deal stage — I pick 'Penawaran harga'. Role — I don't know it yet, so I press Skip. The note is saved with four of five fields filled. Nothing is invented." |
| 1:45–2:15 | Menu + rekap + CSV | Klik 📊 Recap now → 🔔 Check follow-ups → 📤 Export CSV → buka file CSV 2 detik | "Every note is private to my Telegram account. Recap now shows my pipeline and what is due tomorrow. The daily recap arrives at the time I chose. Export CSV turns the pipeline into a spreadsheet a manager can open." |
| 2:15–2:25 | (opsional) Akun kedua | Kirim `/start`, klik 📊 Recap now → "No notes stored yet." | "Two people can use the same bot: notes are keyed by the sender's own chat ID, so this second account sees an empty pipeline — not mine." |
| 2:25–3:05 | Diagram `devpost/video-assets/architecture.png` | Tampilkan diagram, sorot tiap kotak | "Under the hood: Telegram posts to a Cloudflare Worker over HTTPS. The Worker checks Telegram's secret token, so requests without it are rejected. Groq handles transcription and strict-JSON extraction — the API key lives in Cloudflare secrets, never in the repository. Notes live in Cloudflare D1, keyed by owner and note ID, so a note ID alone cannot open anyone's data. A cron trigger runs every minute and claims each user's daily send exactly once — that's what prevents duplicate reminders. No server to keep awake, and it runs on free tiers." |
| 3:05–3:30 | End card | Judul + link | "Weppy is live right now. The bot, the source code, and eleven tests are in the public repository. Next: WhatsApp, and a team view for sales managers. Try it at the link below." |

**Baris voice note** (ucapkan apa adanya, ~12 detik, sengaja tanpa role & tanpa tahap deal):

> "Baru selesai kunjungan ke PT Sinar Abadi di Bandung. Ketemu Bu Rina. Kami bahas paket langganan tahunan untuk 50 user."

## Cara merekam (macOS)

1. Buka Telegram Desktop, atur jendela rapi (mis. 1440×900), pastikan hanya chat bot yang terlihat.
2. `Cmd+Shift+5` → **Record Selected Portion** → pilih area jendela → **Microphone: pilih mic-mu** → Record.
3. Ikuti tabel di atas. Beri jeda ±1 detik sebelum setiap klik supaya mudah dipotong.
4. Stop → simpan `.mov`.
5. **Penting:** voice note terekam dari mic yang sama dengan narasi. Saat merekam voice note, jangan bernarasi — ucapkan laporan Indonesia-nya, lalu lanjutkan narasi setelah terkirim.
6. Kalau ingin audio lebih bersih: rekam layar **tanpa mic**, lalu rekam narasi terpisah dan susun di editor (dua pass).

## Menyunting (CapCut gratis)

- Auto-caption → koreksi manual; **bakar caption English** (juri bisa menonton tanpa suara).
- Zoom 1.2× pada kartu catatan saat muncul; potong jeda tunggu yang panjang (jump cut).
- Sisipkan `devpost/video-assets/architecture.png` pada segmen 2:25.
- End card 3 detik: `Weppy — t.me/recap_sales_bot` + `github.com/Bryyzxm/weppy-public-bot`.
- Musik bebas royalti, volume rendah (± −25 dB) supaya narasi jelas.

## Kalau macet di tengah rekaman

| Masalah | Jalan keluar |
|---|---|
| Mic Telegram Desktop tidak bisa merekam voice note | Rekam voice note dari Telegram di ponsel, lalu **forward** ke chat bot dari desktop. Bot menerima pesan `voice` maupun `audio`. |
| Groq lambat / transkripsi gagal | Tunggu, kirim ulang voice note-nya; jangan ubah alur. Jeda panjang dipotong saat editing. |
| Bot lambat membalas | Potong jeda di editing, atau percepat 2× pada bagian tunggu. |
| Kartu tidak bertanya (semua field terisi) | Ganti voice note: sebut perusahaan + kontak saja, tanpa produk dan tahap deal. |

## Checklist akhir sebelum tempel link

- [ ] Durasi ≤ 4:00 (target 3:30)
- [ ] Problem dijelaskan (±20 detik pertama)
- [ ] Solusi dijelaskan
- [ ] How it works dijelaskan (diagram)
- [ ] Bot live terlihat benar-benar berfungsi (voice note → kartu)
- [ ] Caption English terbakar
- [ ] Link repo + link bot tampil di layar
- [ ] Tidak ada nama pribadi, nomor telepon, atau data klien nyata
- [ ] YouTube Unlisted, sudah diuji dibuka di jendela **incognito**
- [ ] Link ditempel di Devpost sebelum 21 Okt 05:00 WIB
