---
doc: checklist
status: approved
---
<!-- `status` is the progress state every skill reads. Write `draft` when you first save this file,
     and change it to `approved` when the learner clearly approves the displayed plan ("looks good" counts).
     Do not request a second sign-off. Never skip the draft save —
     an unsaved draft dies with the conversation. -->

# Build Checklist

Build mode: fast

## Slices

- [x] **1. Webhook hidup + ping-pong terbukti**
  Becomes usable: `python app.py` jalan di localhost:5000, kirim `ping` (via simulasi webhook) dibalas `pong`, bukti jalur WhatsApp → laptop bekerja.
  Why now: Membuktikan risiko terbesar dulu (tunnel/webhook, bukan AI) sesuai kesepakatan di spec — kalau log diam, masalahnya di tunnel/Callback URL, bukan di AI. Scaffolding ikut di dalam slice ini, bukan langkah sendiri.
  PRD ref: `prd.md > The Core Journey` (langkah 1, sapa/perintah)
  Spec ref: `spec.md > File Structure`, `spec.md > Components` (Webhook dan Chat Router), `spec.md > Where It Runs and How Someone Tries It`, `spec.md > Decisions and Open Issues` (bukti kecil ping-pong)
  Build: Scaffold per `spec.md > File Structure` (app.py, whatsapp.py, store.py, requirements.txt, .env.example, README skeleton, data/); Flask GET /webhook verifikasi + POST /webhook router minimal (perintah `ping` → `pong`, sapaan dasar); store.py baca/tulis atomik data/profile.json + data/notes.json; whatsapp.py kirim teks via Graph API dengan mode stub saat token dummy.
  Verify (mechanical): `pip install -r requirements.txt`; `python -m py_compile app.py store.py whatsapp.py`; jalankan Flask test client: POST /webhook payload `ping` → assert balasan `pong`; GET /webhook verifikasi dengan VERIFY_TOKEN → assert challenge kembali; cek data/profile.json dan data/notes.json terbentuk.
  Learner check: Jalankan `python app.py`, kirim simulasi `ping` (atau dari WA uji kalau tunnel sudah pasang), dan lihat balasan `pong` muncul di log + chat.
  Commit: `Scaffold Flask webhook with ping proof and JSON store`

- [x] **2. Onboarding personal (nama, bahasa, jam rekap)**
  Becomes usable: Sales baru yang chat pertama kali ditanya nama panggilan, bahasa (Indonesia/Inggris), jam rekap satu per satu — semua bisa di-skip — lalu disapa pakai nama.
  Why now: Semua sapaan, bahasa balasan, dan jam rekap di slice berikutnya bergantung pada profil ini; mumpung router dan penyimpanan sudah ada, profil dilengkapi sekarang.
  PRD ref: `prd.md > 0. Onboarding personalisasi saat pertama pakai`, `prd.md > 1. Histori dan rekap saat membuka chat`, `prd.md > 7. Dua bahasa (Indonesia dan Inggris)`
  Spec ref: `spec.md > Components` (Kartu Teks, Klarifikasi Skip, dan Onboarding; Penyimpanan Lokal), `spec.md > Data Model` (data/profile.json), `spec.md > Look and Feel`
  Build: Onboarding state machine di router (onboarding_stage: nama → bahasa → jam → done, tiap langkah bisa di-skip dengan default id + 17:00); simpan ke data/profile.json; sapaan memakai nickname + rekap terakhir dari notes.json; perintah ubah `ubah nama ke X`, `ganti ke bahasa Inggris / switch to Indonesian`, `ubah jam rekap ke HH:MM`; semua kalimat ID + EN di prompts.py.
  Verify (mechanical): Via Flask test client: pesan pertama dari nomor baru → assert Q1 nama; jawab nama → assert Q2 bahasa; skip → assert default id; jawab/skip jam → assert profile.json berisi nickname/language/recap_time/onboarding_stage=done; kirim `halo` setelah onboarding → assert balasan memuat nickname.
  Learner check: Hapus isi data/profile.json jadi kosong, kirim `halo`, jawab/skip tiga pertanyaan, dan lihat sapaan berikutnya memakai nama panggilanmu.
  Commit: `Add chat onboarding with nickname language recap time`

- [x] **3. Laporan teks jadi kartu rapi (inti kernel)**
  Becomes usable: Kirim teks berantakan setelah kunjungan → terima kartu teks 4 field (Institusi, Kontak+Role, Produk, Tahap Deal) + status Terisi/Belum ada + tanggal follow-up tebakan → tersimpan di notes.json.
  Why now: Ini kernel unik dari scope (voice note/teks → catatan rapi tanpa karangan) — dibawa sedini mungkin agar versi teksnya terbukti sebelum suara dan penjadwalan menumpuk.
  PRD ref: `prd.md > 2. Kirim laporan kunjungan via voice note atau teks`, `prd.md > 3. Kartu laporan teks dari agent`
  Spec ref: `spec.md > Components` (Agent Otak, Kartu Teks, Penyimpanan Lokal), `spec.md > Data Model` (data/notes.json), `spec.md > External Services and Dependencies` (Groq API)
  Build: agent.py panggil Groq chat completions (response_format json_object, aturan keras jangan mengarang, tanggal default H+2/H+3 format YYYY-MM-DD) + mode stub deterministik saat GROQ_API_KEY dummy agar bisa diverifikasi offline; router anggap tiap teks non-perintah sebagai laporan; render kartu teks ID/EN per Look and Feel; simpan draf ke notes.json.
  Verify (mechanical): Dengan stub Groq aktif: POST laporan teks contoh (mis. "Baru dari PT Maju Jaya ketemu Ibu Sari purchasing bahas kopi 100kg, minta penawaran harga") → assert kartu memuat 4 label + Terisi/Belum ada + Follow-up DD Mon YYYY; assert notes.json bertambah 1 entri dengan followup_date YYYY-MM-DD dan field kosong tetap kosong (tidak dikarang).
  Learner check: Kirim satu laporan teks bebas via simulasi/WhatsApp, lihat kartu balasannya, lalu buka data/notes.json dan pastikan isinya sama dengan kartu.
  Commit: `Extract text reports to pipeline cards via Groq`

- [x] **4. Voice note jadi teks lalu kartu yang sama**
  Becomes usable: Kirim voice note → ditranskripsi → diproses persis seperti laporan teks; kalau suara tidak jelas, agent minta ulangi, bukan mengarang kartu.
  Why now: Menyelesaikan setengah kernel yang tersisa (input suara) dengan memakai ulang ekstraksi slice 3 — risiko media sementara ~5 menit + format ogg/opus ditangani di sini.
  PRD ref: `prd.md > 2. Kirim laporan kunjungan via voice note atau teks` (termasuk suara tidak jelas → klarifikasi)
  Spec ref: `spec.md > Components` (WhatsApp Connector, Transkripsi Voice Note), `spec.md > External Services and Dependencies` (Media download dua langkah, Groq Whisper), `spec.md > Important Failure Modes` (Media URL kedaluwarsa, VN tidak jelas)
  Build: transcribe.py (Groq Whisper + status unclear) + whatsapp.py download dua langkah GET /{media-id} → unduh segera; router: audio → unduh → transkripsi → lempar ke alur ekstraksi yang sama; jika kosong/gagal → balas klarifikasi minta ulangi + tawarkan ketik teks, jangan simpan catatan setengah AI.
  Verify (mechanical): Dengan stub: POST payload audio dengan media-id palsu + stub download/transkripsi → assert kartu yang sama seperti slice 3 keluar; POST dengan transkripsi kosong → assert balasan klarifikasi (tanpa kartu) dan notes.json tidak bertambah.
  Learner check: Kirim voice note pendek (atau simulasi audio), lihat kartu yang sama seperti laporan teks muncul; coba simulasi suara kosong dan lihat agent meminta ulangi, bukan membuat kartu karangan.
  Commit: `Transcribe voice notes into the same report pipeline`

- [x] **5. Klarifikasi satu per satu dengan Skip**
  Becomes usable: Field yang kosong ditanya satu per satu di chat dengan tombol Skip; Skip = tetap kosong dan lanjut; akhir → catatan `saved` + konfirmasi singkat.
  Why now: Melengkapi janji scope (proaktif tapi tidak menghambat) tepat setelah kartu ada yang kosong — tanpa ini catatan parsial tidak bisa dilengkapi tanpa mengarang.
  PRD ref: `prd.md > 4. Klarifikasi chat satu per satu dengan Skip`, `prd.md > States and Boundaries` (Partial report, Skipped, Persists)
  Spec ref: `spec.md > Components` (Kartu Teks, Klarifikasi Skip, dan Onboarding; WhatsApp Connector quick-reply), `spec.md > Data Model` (pending_clarify, status saved)
  Build: Antrean pending_clarify per catatan draf; tiap pertanyaan + quick-reply Skip (maks 3 tombol, title ≤20 karakter); handler jawaban teks/tombol/ketik `skip`; update notes.json per jawaban; akhir tandai saved + konfirmasi bilingual.
  Verify (mechanical): Buat draf dengan 2 field kosong via stub ekstraksi → assert Q1 klarifikasi + tombol Skip terkirim; kirim jawaban Q1 → assert field terisi + Q2 muncul; kirim `Skip` → assert field tetap kosong + konfirmasi saved; assert notes.json status=saved dan pending_clarify kosong.
  Learner check: Kirim laporan yang sengaja tidak lengkap (mis. tanpa nama kontak), jawab satu pertanyaan, Skip yang berikutnya, dan pastikan konfirmasi akhir + isi notes.json menunjukkan satu terisi satu kosong.
  Commit: `Ask missing fields one by one with Skip`

- [x] **6. Follow-up + rekap sore + siap direkam**
  Becomes usable: Ketik `cek follow-up` / `rekap sekarang` langsung dapat pengingat + rekap per tahap deal + follow-up besok; penjadwal otomatis jalan di jam rekap; README + .env.example cukup agar orang lain bisa jalan + rekam demo.
  Why now: Terakhir karena butuh semua catatan + bahasa + jam rekap sudah benar; menutup loop core journey dan membuat POC bisa didemokan tanpa menunggu sore/tanggal tiba.
  PRD ref: `prd.md > 5. Pengingat follow-up dengan tanggal dari agent`, `prd.md > 6. Rekap pipeline harian sore hari`, `prd.md > States and Boundaries` (Boundary, Template-required)
  Spec ref: `spec.md > Components` (Penjadwal dan Pemicu Demo, Penyimpanan Lokal), `spec.md > External Services and Dependencies` (aturan 24 jam + 4 template ID/EN), `spec.md > Where It Runs and How Someone Tries It`, `spec.md > Important Failure Modes`
  Build: scheduler.py (APScheduler job harian di profile.recap_time + cek follow-up pagi) + fungsi yang sama dipanggil perintah demo `rekap sekarang` / `cek follow-up`; grouping per tahap_deal + filter followup_date==besok; pilih teks bebas (dalam 24 jam) vs template ter-approve per bahasa (followup_reminder_id/daily_recap_id, followup_reminder_en/daily_recap_en) + fallback error jelas; lengkapi README cara jalan + tunnel + token + rekam.
  Verify (mechanical): Seed notes.json 3 catatan (beda tahap + followup besok/lain); panggil fungsi rekap + follow-up langsung → assert output memuat ringkasan per tahap + daftar besok dalam bahasa profil; via test client kirim `rekap sekarang` dan `cek follow-up` → assert balasan sama; assert scheduler jobs terdaftar; `ls README.md .env.example requirements.txt` ada.
  Learner check: Ketik `rekap sekarang` dan `cek follow-up`, nilai apakah rekap per tahap + follow-up besok sudah jelas dan bahasanya mengikuti pilihanmu; ikuti README dari awal untuk memastikan orang lain bisa menjalankannya.
  Commit: `Schedule follow-ups and daily recap with demo commands`

- [x] **7. Jalur Twilio sandbox agar bisa tes dari HP**
  Becomes usable: Chat dari HP via nomor sandbox Twilio (+14155238886) → balasan agent sama persis seperti jalur Meta (kartu, Skip, rekap).
  Why now: Jalur Meta terbukti diblokir untuk +62 (error 130497) dan verifikasi bisnis/pembayaran sulit dipenuhi; tanpa jalur uji nyata, final review tidak bisa lewat WA beneran.
  PRD ref: `prd.md > The Core Journey` (sama, hanya transport chat yang beda)
  Spec ref: `spec.md > External Services and Dependencies` (bagian Twilio Sandbox)
  Build: `whatsapp.py` dual-backend (`WHATSAPP_BACKEND=meta|twilio`, quick-reply jadi teks biasa di Twilio); route baru `POST /twilio/inbound` parsing form Twilio (From/Body/MediaUrl0); unduh media via URL + auth Twilio; `.env.example` + README jalur sandbox; kode Meta tidak diubah.
  Verify (mechanical): Dengan stub Twilio: POST form `Body=ping` → assert `pong`; laporan teks → assert kartu; audio (MediaUrl palsu + TRANSCRIBE_TEXT) → assert kartu; jalur Meta lama tetap lolos regresi.
  Learner check: Join sandbox dari HP (`join <kode>` ke +14155238886), arahkan webhook Twilio ke `/twilio/inbound`, kirim `ping` dan laporan beneran dari HP.
  Commit: `Add Twilio sandbox channel alongside Meta`

- [x] **8. Jalur 360dialog sandbox (tanpa daftar akun)**
  Becomes usable: Chat dari HP via nomor sandbox 360dialog → balasan agent sama (kartu, Skip, rekap); voice note dikecualikan (sandbox tak dukung unduh media).
  Why now: Signup Twilio ditolak filter fraud; sandbox 360dialog tanpa pendaftaran (cukup kirim `START` via WA) dan format webhook-nya identik Meta sehingga adaptasi minimal.
  PRD ref: `prd.md > The Core Journey` (sama, hanya transport chat yang beda)
  Spec ref: `spec.md > External Services and Dependencies` (bagian 360dialog Sandbox)
  Build: `whatsapp.py` backend `d360` (kirim via waba-sandbox.360dialog.io + header D360-API-KEY, payload sama persis); inbound pakai route `/webhook` yang sudah ada tanpa perubahan; voice note di jalur ini dibalas pesan terus-terang + minta ketik teks; `.env.example` + README.
  Verify (mechanical): Dengan stub d360: POST /webhook `ping` → `pong`; laporan → kartu + klarifikasi; audio → pesan vn_sandbox_no_media, notes.json tidak bertambah; regresi Meta + Twilio tetap lolos.
  Learner check: Kirim `START` ke +551146733492, isi D360_API_KEY ke `.env`, set webhook sandbox ke tunnel, kirim `ping` + laporan beneran dari HP.
  Commit: `Add 360dialog sandbox channel`

- [x] **9. Jalur Fonnte (nomor WA sendiri)**
  Becomes usable: Chat dari HP via nomor Fonnte sendiri → balasan agent sama persis seperti jalur Meta (kartu, Skip, rekap).
  Why now: Nomor uji Meta diblokir ke +62 (error 130497), signup Twilio ditolak filter, sandbox 360dialog tanpa media; Fonnte pakai nomor sendiri sehingga bebas blokir negara dan cocok untuk demo live.
  PRD ref: `prd.md > The Core Journey` (sama, hanya transport chat yang beda)
  Spec ref: `spec.md > External Services and Dependencies` (bagian 6. Fonnte)
  Build: `whatsapp.py` backend `fonnte` (kirim `POST https://api.fonnte.com/send` + header `Authorization: FONNTE_TOKEN`, quick-reply/template fallback teks biasa); route baru `POST /fonnte/inbound` parsing JSON Fonnte (sender/message/text/url); unduh voice note dari `url` tanpa auth; `.env.example` + README jalur Fonnte; kode Meta/Twilio/d360 tidak diubah.
  Verify (mechanical): Dengan stub Fonnte: POST JSON `message=ping` → `pong`; laporan teks → kartu + klarifikasi; audio (url palsu + TRANSCRIBE_TEXT) → kartu; pesan kosong → tanpa kartu karangan; regresi Meta + Twilio + d360 tetap lolos.
  Learner check: Isi FONNTE_TOKEN di `.env`, arahkan webhook device ke `/fonnte/inbound`, kirim `ping` dan laporan beneran dari HP.
  Commit: `Add Fonnte channel alongside Meta Twilio d360`

- [x] **10. Jalur Wavio (Meta resmi via wavio.web.id)**
  Becomes usable: Chat dari HP via nomor Wavio → balasan agent sama persis seperti jalur Meta (kartu, Skip, rekap).
  Why now: Wavio adalah Meta Cloud API partner resmi (coexistence, tanpa risiko banned) dengan REST API + webhook publik; menambah jalur demo live yang stabil tanpa mengubah perilaku bot.
  PRD ref: `prd.md > The Core Journey` (sama, hanya transport chat yang beda)
  Spec ref: `spec.md > External Services and Dependencies` (bagian 7. Wavio)
  Build: `whatsapp.py` backend `wavio` (kirim via `POST .../messages/send` + header `X-API-Key`, tombol Skip via `POST .../messages/send-interactive` fallback teks biasa, template via `POST .../messages/send-template`); route baru `POST /wavio/inbound` parsing fleksibel (Meta-style `entry/changes` atau envelope custom) lalu ke `_handle_message` yang sama; voice note via `GET /media/{mediaId}` + transkripsi Groq; `.env.example` + README jalur Wavio; kode Meta/Twilio/d360/Fonnte tidak diubah.
  Verify (mechanical): Dengan stub Wavio: POST `ping` → assert `pong`; laporan teks → assert kartu; audio (url palsu + TRANSCRIBE_TEXT) → assert kartu; pesan kosong → tanpa kartu karangan; regresi Meta + Twilio + d360 + Fonnte tetap lolos.
  Learner check: Isi `WAVIO_API_KEY` + `WAVIO_NUMBER_ID` di `.env`, daftarkan webhook `messages:received` ke `/wavio/inbound`, kirim `ping` dan laporan beneran dari HP.
  Commit: `Add Wavio channel alongside Meta Twilio d360 Fonnte`

- [x] **11. Pivot Transport Layer ke Telegram Bot (POC Hackathon)**
  Becomes usable: Chat bot berjalan 100% via Telegram Bot API (`@BotFather`, gratis, tanpa kartu kredit/risiko ban) dengan kapabilitas AI utuh: voice note `.oga` via Whisper, ekstraksi Groq 4 field, tombol inline Skip, follow-up, rekap harian + tombol detail catatan.
  Why now: WhatsApp gateway butuh kartu kredit / verifikasi bisnis rumit / risiko ban nomor pribadi. Pivot ke Telegram membuktikan 100% kapabilitas AI inti dalam batas waktu hackathon dengan arsitektur modular yang siap dicolok kembali ke WhatsApp BSP saat produksi.
  PRD ref: `prd.md > The Core Journey`
  Spec ref: `spec.md > External Services and Dependencies` (bagian 8. Telegram Bot API)
  Build: `telegram.py` HTTP client (sendMessage, inline keyboard, answerCallbackQuery, getFile/download voice .oga, stub mode); `app.py` route `POST /telegram/webhook` + parser update (text, voice, callback_query); `telegram_poll.py` runner long-polling tanpa ngrok; `scheduler.py` window-free sending ke Telegram; konfigurasi `CHAT_TRANSPORT=telegram` & `TELEGRAM_BOT_TOKEN`; update `.env.example`, `.env`, `README.md`, `test_telegram.py`.
  Verify (mechanical): `python test_telegram.py` lolos 8/8 skenario (ping, onboarding, ekstraksi laporan, callback Skip, voice note Whisper, cek follow-up, rekap sekarang, detail view); regresi WhatsApp `demo_chat.py` tetap lolos.
  Learner check: Buat bot di `@BotFather`, isi token di `.env`, jalankan `python telegram_poll.py`, kirim voice note kunjungan dari HP via Telegram.
  Commit: `Pivot transport layer to Telegram Bot API for hackathon POC`

## Hands-on Checkpoints

- [x] Early usable behavior explored — setelah slice 3 (kernel teks → kartu), sebelum suara/klarifikasi dikunci
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: [what actually happened; real document/test/code references; unfinished work if interrupted]
Route and stops: [actual paths and symbols; guided stops completed, or reference-only route]
Edit outcome: [tried/kept/reverted/declined/not applicable; verification if changed]
Reflection: [offered/answered/declined/already covered — personal answer belongs only in the ignored profile]
Activity mode: [live app and editor, explicit static fallback, focused alternative, prior practice, or recap]

## Revisions

- Uji WA nomor nyata (+62) diblokir Meta error 130497 (akun uji dibatasi mengirim ke negara tertentu) — final review memakai simulasi webhook + stub Groq; wiring WA (verifikasi, subscription messages) terbukti benar dan jalur produksi (nomor sendiri + bisnis terverifikasi) tidak terdampak.
- Tambah jalur Twilio sandbox sebagai transport uji alternatif (disetujui learner) — perilaku bot tidak berubah, hanya `whatsapp.py` + route inbound yang dual-backend; `spec.md > External Services and Dependencies` dilengkapi bagian Twilio.
- Signup Twilio ditolak filter akun; tambah jalur 360dialog sandbox (disetujui learner) — tanpa pendaftaran, format webhook identik Meta; voice note dikecualikan karena sandbox tak dukung unduh media.
- Tes live menemukan dua bug jalur asli (stub tak menangkapnya): prompt ekstraksi pecah oleh `.format()` + model Groq `llama-3.3-70b-versatile` sudah pensiun — diperbaiki ke prompt aman + `openai/gpt-oss-20b`, ekstraksi live terverifikasi tanpa karangan. Bonus: kegagalan kirim pesan tak lagi 500-kan webhook.
- Rekap diperkaya (feedback final review): tiap baris memuat kontak + produk + tanggal follow-up, plus tombol per PT (maks 3/pesan) dan nomor fallback untuk buka kartu lengkap via `view_<id>`.
- Tambah jalur Fonnte berbasis nomor sendiri (disetujui learner) — bebas blokir negara; `whatsapp.py` backend `fonnte` + route `/fonnte/inbound`; quick-reply/template fallback teks biasa; voice note via `url` webhook; `spec.md > External Services` dilengkapi bagian 6. Fonnte.
- Jalur WAAPI.co.id sempat dibangun sebagai slice 10 lalu dibatalkan atas permintaan learner — perubahan kode + docs di-revert penuh (commit revert), tidak ada sisa referensi WAAPI; transport aktif kembali ke Meta/Twilio/d360/Fonnte.
- Jalur waapi.app sempat dibangun sebagai slice 10 baru (stub-first, terverifikasi offline) lalu dibatalkan atas permintaan learner karena risiko banned nomor WA sendiri — perubahan kode + docs di-revert penuh (2 commit revert), tidak ada sisa referensi waapi.app; transport aktif kembali ke Meta/Twilio/d360/Fonnte.
- Tambah jalur Wavio berbasis Meta resmi (disetujui learner) — Official Meta Cloud API Partner dengan coexistence; `whatsapp.py` backend `wavio` (kirim `/messages/send`, tombol Skip via `/messages/send-interactive` fallback teks, template via `/messages/send-template`) + route `/wavio/inbound` parsing fleksibel (Meta-style `entry/changes` atau envelope custom, tak dikenal di-log + ack 200); voice note via `GET /media/{mediaId}`; stub-first terverifikasi offline 25 checks (ping dua bentuk payload, kartu 4 field, klarifikasi Skip, audio, pesan kosong, regresi Meta/Twilio/d360/Fonnte); `spec.md > External Services` dilengkapi bagian 7. Wavio. Live `ping` dari HP masih menunggu kredensial learner.
- Pivot transport layer ke Telegram Bot API untuk POC hackathon (disetujui learner) — WhatsApp gateway butuh kartu kredit / verifikasi bisnis rumit / risiko ban nomor pribadi; pivot ke Telegram Bot API (@BotFather) memberikan jalur demo gratis instan 1 menit tanpa kartu kredit, tanpa risiko ban, dan tanpa batas 24 jam. Semua kapabilitas AI inti (Groq LLM 4 field, Groq Whisper voice note .oga, tombol inline Skip, follow-up, rekap harian) terbukti 100% fungsional di Telegram; arsitektur dibuat modular (CHAT_TRANSPORT=telegram|whatsapp) sehingga siap dipasang kembali ke WhatsApp BSP saat produksi.
