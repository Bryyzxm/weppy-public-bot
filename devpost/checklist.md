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

