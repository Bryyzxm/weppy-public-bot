---
doc: spec
status: approved
---

# Asisten Sales WhatsApp B2B — Technical Spec

## How This Works, In Plain Language

Sistem ini ada 4 potong besar, semuanya jalan di laptopmu dengan Python:

1. **Penerima chat (webhook):** sebuah program Python kecil yang nungguin pesan WhatsApp masuk. Analogi: seperti resepsionis yang duduk di meja dan menerima setiap surat yang diantar kurir.
2. **Otak agent (Groq API):** saat laporan masuk, teksnya dikirim ke AI Groq untuk diubah jadi 4 info rapi (institusi, contact + role, produk/layanan, tahap deal) plus tanggal follow-up yang ditebak dari isi laporan. Voice note diubah jadi teks dulu (transkripsi), lalu prosesnya sama seperti teks.
3. **Buku catatan (file JSON lokal):** semua catatan dan pengaturan (nama panggilan, bahasa, jam rekap) disimpan di dua file teks di laptop (`profile.json` dan `notes.json`). Seperti spreadsheet yang dibaca-tulis program. Buka chat besok = baca file ini lagi, jadi tidak hilang.
4. **Pengingat waktu (penjadwal):** potongan yang mengecek jam. Tiap sore di jam rekap ia bikin rekap, dan tiap tanggal follow-up tiba ia kirim pengingat. Untuk demo ada jalan pintas: ketik `rekap sekarang` langsung kirim tanpa nunggu sore.

Kenapa bentuk ini, bukan yang lebih rumit: tidak ada database server, tidak ada login, tidak ada deploy, tidak ada Flows (layar web di dalam chat). Semua yang dihemat itu tidak membuktikan ide inti. Ide inti — voice note berantakan jadi catatan rapi tanpa karangan, dengan opsi Skip — tetap utuh dan bisa direkam dalam 2–4 jam kerja aktif.

Istilah yang dipakai di bawah: **webhook** = alamat di laptop yang diketuk WhatsApp tiap ada pesan baru; **tunnel (ngrok)** = terowongan sementara supaya internet bisa menjangkau laptop; **tombol cepat (quick reply)** = tombol Skip / pilihan di bawah pesan.

## The Core Journey Through the System

PRD ref: `prd.md > The Core Journey`.

0. **Onboarding →** Sales chat pertama kali → webhook terima → cek `profile.json` kosong → tanya nama, lalu bahasa (Indonesia/Inggris), lalu jam rekap, satu per satu. Tiap langkah bisa di-skip (default: Indonesia, 17:00). Simpan ke `profile.json`. PRD ref: `prd.md > 0. Onboarding personalisasi saat pertama pakai`.
1. **Buka chat →** Tidak ada aksi khusus dari sistem saat chat dibuka (Cloud API tidak punya event on-open; histori = bawaan WhatsApp). Jika sales menyapa / kirim perintah, agent balas dengan sapaan + nama + rekap terakhir dari `notes.json`. PRD ref: `prd.md > 1. Histori dan rekap saat membuka chat`.
2. **Kirim laporan →** Sales kirim teks / voice note → webhook terima → kalau suara, tukar `media.id` jadi URL sementara via `GET /{media-id}` lalu unduh segera (kedaluwarsa ~5 menit) lalu transkripsi via Groq Whisper jadi teks → teks dianggap satu laporan. Kalau suara tidak jelas, tidak dibuatkan kartu karangan — minta ulangi bagian yang kurang. PRD ref: `prd.md > 2. Kirim laporan kunjungan via voice note atau teks`.
3. **Kartu teks →** Teks laporan dikirim ke Groq ekstraksi → dapat 4 field + status terisi/belum + tanggal follow-up tebakan → simpan draf ke `notes.json` → kirim kartu teks rapi (label jelas + Terisi/Belum ada) + tombol/instruksi "jawab di chat untuk melengkapi". Bukan Flows. PRD ref: `prd.md > 3. Kartu laporan teks dari agent`.
4. **Klarifikasi Skip →** Untuk tiap field kosong, tanya satu per satu di chat, tiap pertanyaan ada quick-reply **Skip** (maks 3 tombol/pesan, judul ≤20 karakter). Skip = field tetap kosong, lanjut. Setelah semua terjawab/di-skip, tandai catatan `saved` dan kirim konfirmasi singkat. PRD ref: `prd.md > 4. Klarifikasi chat satu per satu dengan Skip`.
5. **Follow-up →** Tanggal tebakan agent disimpan di catatan dan ditampilkan di kartu (`DD Mon YYYY` di chat, `YYYY-MM-DD` di JSON). Saat tanggal tiba: jika masih dalam 24 jam sejak pesan terakhir sales kirim pesan bebas, jika di luar window kirim template ter-approve. Perintah demo `cek follow-up` memanggil fungsi yang sama. PRD ref: `prd.md > 5. Pengingat follow-up dengan tanggal dari agent`.
6. **Rekap sore →** Tiap sore di jam rekap (atau saat ketik `rekap sekarang`), baca semua `notes.json`, kelompokkan per tahap deal + daftar follow-up besok. Jalur demo `rekap sekarang` = pesan bebas (dalam sesi aktif); jalur otomatis sore = template rekap ter-approve (karena hampir selalu di luar 24 jam). Bahasa mengikuti pilihan onboarding. PRD ref: `prd.md > 6. Rekap pipeline harian sore hari` dan `prd.md > 7. Dua bahasa (Indonesia dan Inggris)`.

```
Sales ──teks/VN──▶ webhook ──teks──▶ Groq ekstraksi ──4 field──▶ kartu teks ──▶ Sales
                        │                    ▲                          │
                        │              transkripsi VN                   ▼
                        └──────── file JSON ◀── simpan/skipped ── klarifikasi Skip
                                     │
                        ┌────────────┴────────────┐
                        ▼                         ▼
                 pengingat follow-up        rekap sore (jadwal / perintah demo)
```

## Stack

- **Python 3.10+** — pilihan learner (dikonfirmasi di interview). Semua logika di satu bahasa.
- **Flask 3.x** — web framework untuk webhook. Rekomendasi agent untuk POC ini, belum dipakai learner sebelumnya. Alasan: satu file, konsep paling sedikit (satu route GET verifikasi + satu route POST pesan), cocok untuk pemula. Tradeoff: bukan async modern seperti FastAPI, tapi tidak dibutuhkan untuk satu sales uji. Perlu disetujui lewat review spec ini.
  - Docs: https://flask.palletsprojects.com/
- **Groq API (gratis)** — pilihan learner. Dipakai untuk 2 kerjaan: (a) chat completion untuk ekstraksi 4 field + tanggal follow-up + kalimat balasan dua bahasa, (b) transkripsi Whisper untuk voice note. Alasan: tier gratis, API gaya OpenAI, cukup untuk demo. Tradeoff: butuh API key + internet, limit gratis dan nama model bisa berubah — diverifikasi awal saat build.
  - Docs: https://console.groq.com/docs
  - Yang belum diverifikasi (cek di awal build, tanpa akses network spec ini tetap bisa dipakai): nama model chat yang aktif saat build (contoh kandidat: `llama-3.3-70b-versatile`), endpoint transkripsi (`whisper-large-v3`), limit rate gratis.
- **APScheduler 3.x** — penjadwal di dalam proses Python untuk rekap sore + cek follow-up. Rekomendasi agent (detail turunan). Alasan: tidak perlu cron sistem / servis luar, jalan bareng `app.py`. Tradeoff: hanya jalan saat laptop + program nyala — cukup untuk POC lokal.
  - Docs: https://apscheduler.readthedocs.io/
- **ngrok (atau Cloudflare Tunnel) gratis** — terowongan agar webhook lokal bisa dijangkau Meta. Rekomendasi agent (detail turunan). Alasan: setup 1 perintah, URL publik sementara untuk mode uji. Tradeoff: URL berubah tiap restart (paket gratis) → perlu update di dashboard Meta tiap demo ulang; alternatif Cloudflare Tunnel gratis dengan URL lebih stabil.
  - Docs: https://ngrok.com/docs — alternatif: https://developers.cloudflare.com/cloudflare-one/connections/cloudflared/
- **requests + python-dotenv** — panggil Graph API WhatsApp dan baca key dari `.env`. Detail turunan standar Python.
- **Penyimpanan: dua file JSON** (`data/profile.json`, `data/notes.json`) via stdlib `json` — pilihan learner (disetujui "file lokal sederhana"). Alasan: tanpa server, bisa dibuka dan dibaca langsung (bagus untuk tujuan belajar workflow AI). Tradeoff: filter (per tahap, follow-up besok) ditulis sebagai loop Python — tidak masalah untuk <100 catatan.

## Where It Runs and How Someone Tries It

- **Runtime:** proses Python lokal (laptop). Tidak ada deploy. Orang lain mencoba dengan clone repo GitHub + bikin kredensial Meta + Groq sendiri, lalu jalan lokal + rekam — sesuai keputusan learner.
- **Kebutuhan:** Python 3.10+, akun Meta Developer (WhatsApp Cloud API mode uji coba), 1 nomor pengirim uji, `GROQ_API_KEY`, `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `VERIFY_TOKEN` (bebas pilih string, dipakai verifikasi webhook).
- **Cara jalan (untuk demo recording dan untuk orang lain):**
  1. `pip install -r requirements.txt`
  2. isi `.env` dari `.env.example`
  3. `python app.py` (jalan di `http://localhost:5000`)
  4. di terminal lain: `ngrok http 5000` → salin URL `https://xxx.ngrok-free.app`
  5. di dashboard Meta Developer → WhatsApp → Configuration → Callback URL isi `https://xxx.ngrok-free.app/webhook`, Verify Token isi yang sama dengan `.env`, Subscribe ke field `messages`
  6. buka chat WhatsApp uji, kirim teks / voice note. Untuk rekap instan ketik `rekap sekarang`. Untuk pengingat instan ketik `cek follow-up`.
- **Yang direkam:** kirim voice note berantakan → kartu teks rapi muncul → jawab/Skip klarifikasi → konfirmasi tersimpan → `rekap sekarang` → rekap per tahap + follow-up besok. Plus tunjukkan `data/notes.json` terbuka sebagai bukti tersimpan.

## Look and Feel

Carry-forward dari `prd.md > Look and Feel` dan `scope.md > Inspiration & Identity`, dalam bentuk yang bisa dikerjakan build agent:

- Bukan app visual: tidak ada palette/font kustom — mengikuti gaya bawaan WhatsApp.
- Nada chat: singkat, praktis, membantu; sapaan pakai nama panggilan setelah onboarding.
- Kartu teks mudah dipindai: 4 label jelas (Institusi/Perusahaan, Kontak + Role, Produk/Layanan, Tahap Deal) + penanda status `Terisi: ...` / `Belum ada`, plus baris `Follow-up: <tanggal>` dan instruksi `Balas di chat untuk melengkapi / ketik Skip`.
- Tombol cepat: `Skip` di setiap pertanyaan klarifikasi sebagai quick-reply (maks 3 tombol per pesan, judul ≤20 karakter); bahasa tombol mengikuti bahasa pilihan.
- Dua bahasa penuh: semua kalimat agent (tanya onboarding, kartu, klarifikasi, konfirmasi, pengingat, rekap) tersedia Indonesia + Inggris, mengikuti `profile.json.language`. Memahami laporan campuran ID/EN sebagai satu alur. PRD ref: `prd.md > 7. Dua bahasa (Indonesia dan Inggris)`.

## Components

### Webhook dan Chat Router

Menerima semua event dari Meta (GET verifikasi + POST pesan masuk), memilah perintah vs laporan vs jawaban klarifikasi, memanggil komponen lain, dan membalas via WhatsApp.
PRD ref: `prd.md > 2. Kirim laporan kunjungan via voice note atau teks`, `prd.md > 1. Histori dan rekap saat membuka chat`.
Berbicara dengan: WhatsApp Connector, Agent Otak, Penyimpanan Lokal, Penjadwal (untuk perintah demo).

### WhatsApp Connector

Kirim tiga jenis pesan via Graph API: (a) teks bebas (dalam 24 jam window), (b) quick-reply `Skip` (maks 3 tombol, `id` + `title` ≤20 karakter), (c) template ter-approve untuk pengingat/rekap di luar window. Download voice note dua langkah: `GET /{media-id}` → URL sementara (~5 menit) → unduh segera. Tidak ada logika bisnis di sini.
PRD ref: `prd.md > 2. Kirim laporan kunjungan via voice note atau teks`, `prd.md > 3. Kartu laporan teks dari agent`, `prd.md > 5. Pengingat follow-up`, `prd.md > 6. Rekap pipeline harian`.
Berbicara dengan: Meta Graph API, Webhook Router, Transkripsi.

### Transkripsi Voice Note

Mengubah file audio (ogg/opus dari WhatsApp) jadi teks via Groq Whisper. Jika hasil kosong / confidence rendah / Groq gagal, kembalikan status `unclear` agar router meminta klarifikasi, bukan mengarang kartu.
PRD ref: `prd.md > 2. Kirim laporan kunjungan via voice note atau teks` (termasuk "suara tidak jelas → klarifikasi").
Berbicara dengan: WhatsApp Connector, Agent Otak.

### Agent Otak (Ekstraksi + Bahasa)

Satu pemanggil Groq dengan instruksi (prompts dua bahasa): input teks laporan → output JSON ketat `{institusi, kontak, role, produk, tahap_deal, tanggal_followup, bahasa_terdeteksi, belum_jelas}`. Aturan keras: field yang tidak disebut = kosong, jangan dikarang; tanggal follow-up ditebak wajar (default H+2/H+3 jika tidak disebut, format `YYYY-MM-DD`); kalimat balasan memakai bahasa dari profil, bukan deteksi per pesan.
PRD ref: `prd.md > 3. Kartu laporan teks dari agent`, `prd.md > 5. Pengingat follow-up dengan tanggal dari agent`, `prd.md > 7. Dua bahasa (Indonesia dan Inggris)`.
Berbicara dengan: Prompts, Penyimpanan Lokal (draf catatan).

### Kartu Teks, Klarifikasi Skip, dan Onboarding

Tiga alur chat yang semuanya teks + tombol:
- Kartu: render 4 field + status + tanggal + cara lanjut.
- Klarifikasi: antrean field kosong, tanya satu per satu + tombol `Skip`; Skip = kosong dan lanjut; akhir = tandai `saved` + konfirmasi.
- Onboarding: 3 tanya berurutan (nama, bahasa, jam rekap), tiap langkah bisa di-skip; perintah ubah setelah onboarding: `ubah nama ke X`, `ganti ke bahasa Inggris / switch to Indonesian`, `ubah jam rekap ke HH:MM`.
PRD ref: `prd.md > 0. Onboarding personalisasi saat pertama pakai`, `prd.md > 3. Kartu laporan teks dari agent`, `prd.md > 4. Klarifikasi chat satu per satu dengan Skip`. Perintah ubah dan format tanggal sudah diputuskan di `prd.md > Open Questions` + `spec.md > Decisions and Open Issues`.
Berbicara dengan: WhatsApp Connector, Penyimpanan Lokal.

### Penyimpanan Lokal

Dua file JSON + fungsi baca/tulis atomik (tulis ke file temp lalu rename agar tidak korup). Menyimpan profil dan catatan antar sesi.
PRD ref: `prd.md > States and Boundaries` (Persists), `prd.md > 1. Histori dan rekap saat membuka chat`, `prd.md > 6. Rekap pipeline harian sore hari`.
Berbicara dengan: semua komponen yang butuh baca/tulis.

### Penjadwal dan Pemicu Demo

APScheduler: job harian di `profile.recap_time` (default 17:00) memanggil fungsi rekap yang sama dengan perintah `rekap sekarang`; job cek follow-up tiap pagi + perintah `cek follow-up` memanggil fungsi yang sama. Aturan kirim: cek umur sesi 24 jam — dalam window kirim teks bebas, di luar window kirim template sesuai `profile.language` (`followup_reminder_id` / `daily_recap_id` untuk `id`, `followup_reminder_en` / `daily_recap_en` untuk `en_US`, variabel `{{1}}` dst.). Fungsi-fungsi ini murni baca `notes.json` → susun pesan → kirim via Connector, sehingga output otomatis dan demo identik.
PRD ref: `prd.md > 5. Pengingat follow-up dengan tanggal dari agent`, `prd.md > 6. Rekap pipeline harian sore hari`.
Berbicara dengan: Penyimpanan Lokal, WhatsApp Connector.

## Data Model

Semua di file lokal, tidak ada server. Setiap potong: di mana tinggal, kapan diubah, apa yang terjadi saat kembali.

**`data/profile.json` — pengaturan sales uji (satu objek):**
```json
{
  "sender_allowlist": ["62812xxxx"],
  "nickname": "Budi",
  "language": "id",
  "recap_time": "17:00",
  "onboarding_stage": "done"
}
```
- Tinggal di `data/profile.json`. Diubah saat onboarding dan saat perintah ubah (`ubah nama/bahasa/jam`). Saat kembali: dibaca tiap pesan masuk untuk sapaan + bahasa + jam rekap. Kosong = anggap pengguna baru → mulai onboarding.

**`data/notes.json` — daftar catatan pipeline (array):**
```json
[
  {
    "id": "20261002-001",
    "created_at": "2026-10-02T15:04:00",
    "institusi": "PT Maju Jaya",
    "kontak": "Ibu Sari",
    "role": "Purchasing Manager",
    "produk": "Kopi arabika 100kg",
    "tahap_deal": "Penawaran harga",
    "followup_date": "2026-10-04",
    "status": "saved",
    "pending_clarify": []
  }
]
```
- Tinggal di `data/notes.json`. Diubah saat: laporan baru (tambah draf `status: draft`), tiap jawaban/Skip klarifikasi (update field), selesai klarifikasi (tandai `saved`). Saat kembali: sumber kebenaran = file ini (riwayat bawaan WhatsApp tidak diambil via API); rekap = group by `tahap_deal` + filter `followup_date == besok`; sapaan/rekap terakhir dihitung ulang dari file ini saat sales menyapa.

**State sementara (tidak disimpan):** status "sedang mendengarkan/mengetik", hasil transkripsi mentah, draf prompt. Hilang saat restart tidak masalah — PRD ref: `prd.md > States and Boundaries` (Disappears).

## File Structure

```
sales-wa-assistant/
├── app.py              # Flask: GET /webhook verifikasi, POST /webhook router, perintah demo
├── whatsapp.py         # kirim teks+tombol, download media VN via Graph API
├── agent.py            # panggil Groq: ekstraksi 4 field + tanggal + balasan bilingual
├── prompts.py          # instruksi AI (ID + EN), aturan "jangan mengarang"
├── transcribe.py       # VN → teks via Groq Whisper, status unclear jika gagal
├── store.py            # baca/tulis profile.json + notes.json (atomik)
├── scheduler.py        # APScheduler: rekap harian + cek follow-up + fungsi yang dipakai perintah demo
├── requirements.txt    # flask, apscheduler, requests, python-dotenv, groq
├── .env.example        # GROQ_API_KEY, WHATSAPP_TOKEN, PHONE_NUMBER_ID, VERIFY_TOKEN
├── README.md           # cara jalan lokal + cara rekam demo (dibaca orang lain dari GitHub)
└── data/
    ├── profile.json    # pengaturan satu sales uji (dibuat saat onboarding)
    └── notes.json      # catatan pipeline (array, mulai kosong [])
└── devpost/            # workspace belajar (learner-profile, scope, prd, spec)
```

## External Services and Dependencies

**1. Meta WhatsApp Cloud API (mode uji coba) — kirim/terima chat.**
- Panggil: `POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages` dengan header `Authorization: Bearer {WHATSAPP_TOKEN}`; body `{"messaging_product":"whatsapp","to":"<sender>","type":"text","text":{"body":"..."}}`, atau `type: interactive` + `action.buttons` (maks 3, `reply.id` + `reply.title` ≤20 karakter) untuk tombol Skip, atau `type: template` + `{name, language:{code:"id"}, components}` untuk pengingat/rekap di luar 24 jam. Terima: `POST /webhook` dari Meta berisi `entry[0].changes[0].value.messages[0]` (text atau audio dengan `audio.id`). Media diunduh dua langkah: `GET https://graph.facebook.com/v21.0/{media-id}` → dapat URL sementara (~5 menit) → `GET` URL file segera.
- Aturan 24 jam (ketat): pesan bebas + quick-reply hanya terkirim jika sales pernah chat dalam 24 jam terakhir; selebihnya wajib template yang sudah di-approve di dashboard Meta (kategori Utility). Template POC 2 bahasa mengikuti `profile.language`: `followup_reminder_id` / `daily_recap_id` (language `id`) dan `followup_reminder_en` / `daily_recap_en` (language `en_US`). Isi variabel sama: pengingat (institusi, kontak, hal ditindaklanjuti, tanggal `DD Mon YYYY`) dan rekap (ringkasan per tahap, follow-up besok). Connector memilih template berdasarkan bahasa profil. Nama final diputuskan saat build.
- Docs: https://developers.facebook.com/docs/whatsapp/cloud-api + Context7 `/filipporomani/whatsapp-python` (template + 24h window), `/piusalfred/whatsapp` (webhook + media download), `/whatsapp/whatsapp-flows-tools` (alasan bukan Flows: butuh `flow_id/flow_token`/endpoint enkripsi).
- Key: `WHATSAPP_TOKEN` (token sementara uji coba, kedaluwarsa cepat), `PHONE_NUMBER_ID`, `VERIFY_TOKEN` (bebas). Batas/biaya: gratis di mode uji untuk 1 nomor uji + allowlist; yang perlu diverifikasi awal build: versi Graph API aktif (contoh `v21.0` di atas bisa bergeser), template sudah `APPROVED`, dan subscribe field `messages`.

**2. Groq API — ekstraksi + transkripsi.**
- Panggil (gaya OpenAI): chat `POST https://api.groq.com/openai/v1/chat/completions` dengan `{model, messages:[system dari prompts.py, user=text laporan], response_format:{type:"json_object"}}`; transkripsi `POST https://api.groq.com/openai/v1/audio/transcriptions` multipart `{file, model:"whisper-large-v3"}`.
- Docs: https://console.groq.com/docs
- Key: `GROQ_API_KEY`. Batas/biaya: tier gratis dengan rate limit — cukup untuk demo; yang perlu diverifikasi awal build: nama model chat yang tersedia saat itu dan nama model whisper.

**3. ngrok (atau Cloudflare Tunnel) — terowongan webhook lokal.**
- Panggil: `ngrok http 5000` → URL publik → ditempel ke Callback URL Meta. Tidak ada kode, hanya operasional demo.
- Docs: https://ngrok.com/docs
- Batas: URL gratis berubah tiap restart → update Callback URL tiap mulai ulang. Alternatif gratis: Cloudflare Tunnel.

**4. Twilio Sandbox — transport uji alternatif (revisi build).**
- Alasan: nomor uji Meta (+1) diblokir mengirim ke +62 (error 130497) dan verifikasi bisnis/pembayaran sulit dipenuhi; sandbox Twilio gratis, tanpa verifikasi, nomor harian learner tetap utuh. Perilaku bot identik — hanya transport yang beda (`WHATSAPP_BACKEND=twilio`).
- Panggil: kirim API Twilio `POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json` (Basic Auth SID/token); terima: `POST /twilio/inbound` form-encoded (`From`/`Body`/`MediaUrl0`). Quick-reply buttons tidak didukung → dikirim sebagai teks biasa (instruksi Skip tetap ada di kalimat). Media voice note diunduh dari `MediaUrl0` + auth Twilio, lalu transkripsi Groq seperti biasa.
- Docs: https://www.twilio.com/docs/whatsapp/sandbox
- Key: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (mis. `whatsapp:+14155238886`).
- Batas/biaya: trial gratis tanpa kartu kredit (100 pesan WA); setelah itu $0.005/pesan + fee template Meta. Sandbox: join kedaluwarsa tiap 3 hari (kirim `join <kode>` ulang), maks 1 pesan/3 detik, tanpa custom template (balasan bebas dalam 24 jam window tetap bisa). Risiko: nomor sandbox bersama kadang juga dibatasi ke negara tertentu (mis. Indonesia) — jika gagal, hubungi Twilio Support atau kembali ke simulasi.

**5. 360dialog Sandbox — transport uji tanpa pendaftaran (revisi build).**
- Alasan: signup Twilio ditolak filter akun; sandbox 360dialog cukup kirim `START` via WA ke +551146733492 untuk dapat API key — tanpa akun, verifikasi, atau kartu. Format webhook identik Meta sehingga route `/webhook` dipakai ulang tanpa perubahan; kirim via `POST https://waba-sandbox.360dialog.io/v1/messages` + header `D360-API-KEY` (payload sama persis).
- Docs: https://docs.360dialog.com/docs/get-started/sandbox
- Key: `D360_API_KEY` (`WHATSAPP_BACKEND=d360`).
- Batas: gratis 200 pesan ke nomor sendiri (cukup untuk POC); tanpa custom template (tidak dipakai POC ini); **unduh media via media ID tidak didukung** → voice note di jalur ini dijawab terus-terang + diminta ketik teks. Risiko lintas negara (+55 → +62) tetap mungkin; jika gagal, kembali ke simulasi.

## Important Failure Modes

- **Tunnel mati / URL berubah →** WhatsApp tidak bisa mengetuk laptop; sales kirim pesan tapi tidak ada balasan. Fallback: cek log `app.py`, jalankan `ngrok http 5000` ulang, update Callback URL di Meta, kirim `ping` untuk tes. Untuk rekaman, pastikan tunnel hijau sebelum mulai.
- **Di luar 24 jam tanpa template / template belum APPROVED →** Graph API menolak kirim proaktif (pengingat/rekap gagal, bukan bug agent). Fallback: log error + kirim pemberitahuan saat sales chat berikutnya ("rekap kemarin gagal karena template X belum approve"); untuk demo selalu siapkan `rekap sekarang` / `cek follow-up` yang berjalan dalam window. Pastikan 4 template (ID + EN untuk pengingat dan rekap) berstatus APPROVED sebelum rekam otomatis.
- **Media URL kedaluwarsa (~5 menit) →** download voice note gagal jika antre. Fallback: unduh segera di handler webhook sebelum panggil Groq; jika gagal minta kirim ulang VN.
- **Groq lambat / limit / key salah →** kartu tidak keluar atau lama. Fallback: balas pesan "otak AI sibuk, coba kirim ulang 1 menit lagi" + tulis log error; jangan simpan catatan setengah AI. Untuk demo siapkan 1 contoh laporan teks pendek yang sudah pernah berhasil.
- **Voice note tidak jelas / transkripsi kosong →** sesuai PRD: tidak dibuatkan kartu karangan. Fallback: tanya "bagian X kurang jelas, boleh diulang?" dan tawarkan ketik teks sebagai gantinya.
- **Token WhatsApp kedaluwarsa (umum di mode uji) →** kirim gagal 401. Fallback: generate token baru di Meta Developer → update `.env` → restart `app.py`. Dicatat di README agar orang lain dari GitHub tidak bingung.

## What Was Simplified and Why

- **Kartu teks + tombol cepat** instead of Flows (layar web di dalam chat) — karena Flows butuh konfigurasi layar + endpoint tambahan yang sendirinya bisa makan 1–2 jam dan berisiko gagal demo. Kernel (ekstraksi rapi + status + Skip) tetap terbukti lewat teks. Versi Flows bisa ditambah nanti setelah alur Skip terbukti.
- **Dua file JSON** instead of database server (Postgres/MySQL) atau 6 tabel — karena satu sales uji + <100 catatan tidak butuh query server; file bisa dibuka langsung untuk belajar aliran data. Butuh SQL hanya jika naik ke banyak sales.
- **Satu sales + allowlist satu nomor** instead of multi-user/tim — sesuai `scope.md > The POC Boundary`; webhook menolak nomor di luar allowlist dengan pesan sopan.
- **APScheduler + perintah `rekap sekarang` / `cek follow-up`** instead of cron produksi / worker antrean — karena demo tidak bisa nunggu sore; fungsi yang sama dipakai jadwal dan perintah sehingga output identik dan terlihat timing-nya.
- **Lokal + rekaman, tanpa deploy** instead of URL publik permanen — karena submission hanya wajib video + repo; deploy menambah akun, biaya, dan failure mode tanpa membuktikan kernel. Orang lain tetap bisa jalan via README.
- **Perintah ubah pengaturan via chat natural** instead of layar pengaturan — karena tidak ada dashboard di POC ini (PRD ref: `prd.md > Screens and Layout`).

## Decisions and Open Issues

- **Python** — pilihan learner (interview). Rasional: sudah dikenal, ekosistem AI Python paling gampang untuk Groq + audio.
- **Lokal + rekaman; orang lain via GitHub README** — pilihan learner. Rasional: memenuhi submission tanpa biaya hosting.
- **Groq gratis** — pilihan learner (minta gratis/lokal dulu). Rasional: satu API untuk chat + suara. Tradeoff diterima: butuh internet + key, limit gratis. Detail turunan: model exact dicek awal build.
- **JSON lokal** — pilihan learner (setuju). Rasional: transparan untuk belajar. Tradeoff diterima: filter manual di Python.
- **Kartu teks + tombol** — pilihan learner (pilih simpel). Rasional: hemat 1–2 jam vs Flows. Ini penyederhanaan resmi, dicatat di atas.
- **Jadwal + pemicu demo** — pilihan learner (setuju). Rasional: demo-able tanpa nunggu sore.
- **Perintah ubah nama/bahasa/jam via chat** — pilihan learner (oke). Menutup `prd.md > Open Questions` baris 1. Format tanggal (`prd.md > Open Questions` baris 2) diputuskan: tampil `DD Mon YYYY` di chat (mis. `04 Okt 2026`), simpan `YYYY-MM-DD` di JSON; bisa disesuaikan saat build tanpa memblokir spec.
- **Flask + APScheduler + ngrok** — rekomendasi agent sebagai detail turunan dari pilihan Python/lokal (murah + sedikit konsep). Belum dipakai learner; persetujuan diminta lewat review spec ini — bukan diklaim sebagai pilihan learner.
- **Satu ketidakpastian learner yang dibahas — "cara webhook lokal connect ke WA":** yang membingungkan adalah bagaimana pesan dari internet sampai ke laptop yang tidak punya alamat publik. Penjelasan konkret: (1) `app.py` nyala di `localhost:5000` — baru bisa dijangkau dari laptop sendiri; (2) `ngrok http 5000` memberi alamat publik sementara (mis. `https://abc.ngrok-free.app`) yang meneruskan semua ketukan ke laptop — analogi terowongan dari jalan raya ke gang rumah; (3) alamat itu + Verify Token didaftarkan sekali di dashboard Meta; Meta mengetuk `GET /webhook` untuk verifikasi, lalu tiap pesan masuk mengetuk `POST /webhook`; (4) program membalas lewat Graph API (jalur keluar, tidak butuh tunnel). Bukti kecil yang disepakati saat build: sebelum kerjakan AI, verifikasi dulu — kirim `ping` dari WA uji dan lihat log `app.py` + balasan `pong`. Jika log diam, masalahnya di tunnel/Callback URL, bukan di AI. Dicatat di sini agar tidak dikejar sebagai bug AI nanti.
- **Masih terbuka / diverifikasi awal saat build:** nama model Groq yang aktif, versi Graph API Meta, format audio VN yang dikirim Meta (ogg/opus), dan limit rate gratis Groq. Semuanya tidak memblokir approval spec ini.
