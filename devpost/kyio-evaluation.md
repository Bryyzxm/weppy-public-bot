# Evaluasi KyioAPI sebagai pengganti Groq di Weppy

Tanggal: 15 Oktober 2026. **Keputusan: pertahankan Groq. Kyio belum layak dinyatakan sebagai pengganti penuh.** Endpoint publik Kyio berlabel `gpt-5` layak menjadi kandidat eksperimen teks dengan adapter, tetapi belum layak cutover produksi. Endpoint publik berlabel `claude-haiku-4-5` tidak memenuhi kontrak JSON saat ini dan mengisi tahap yang secara eksplisit belum diketahui. **Pembaruan setelah screenshot pengguna: STT UniScribe sudah berhasil diuji, tetapi jauh lebih lambat dan satu permintaan mendapat HTTP 429.** TTS dan jalur chat berbayar masih belum tervalidasi.

Ini evaluasi fungsional terukur, **bukan** klaim bahwa semua endpoint/model Kyio telah diuji atau layanan berbayarnya gagal. Kunci Kyio tidak tersedia dan halaman katalog audio tetap terhalang challenge; screenshot pengguna menyediakan endpoint STT sehingga upload dapat diuji langsung tanpa key. Tidak ada kode aplikasi, konfigurasi provider, database, data pelanggan, bot Telegram, atau deployment yang diubah.

## Cakupan dan metode

- **58 panggilan ekstraksi live:** 24 ke Groq `openai/gpt-oss-20b`, 24 ke Kyio `/api/ai/claude-haiku-4-5`, dan 10 ke endpoint Kyio `/api/ai/gpt-5` yang dicontohkan dalam [panduan resminya](https://api.kyio.web.id/docs/api-keys).
- **4 panggilan STT live Groq:** OGG/Opus sintetis Indonesia bersih, Inggris bersih, Indonesia dengan noise, dan hening. Audio dibuat lokal dengan `say` dan `ffmpeg`; bukan rekaman pengguna.
- **3 pemeriksaan terpisah pada evaluasi awal:** request tanpa `q` (400), chat OpenAI-compatible tanpa key (401), dan generasi positif dari runtime `workerd` lokal (200). Total awal **65 panggilan API uji**, tidak termasuk pembacaan dokumentasi. Evaluasi UniScribe lanjutan menambah 4 upload Kyio dan 3 baseline Groq baru; seluruhnya tercatat di artefak terpisah, ditambah pemeriksaan validasi GET tanpa input.
- Set utama: 16 skenario berbeda + 4 pengulangan = 20 percobaan per provider. Set tambahan: dua transkrip audio nyata hasil baseline STT, batas field 80 karakter, dan tahap yang tidak diketahui. Set GPT-5: sembilan skenario berbeda + satu pengulangan dari set utama; bukan seluruh set 24.
- Skenario mencakup laporan lengkap/tidak lengkap/tanpa fakta, Indonesia/Inggris/campuran, besok/minggu depan, prioritas tanggal eksplisit, pergantian bulan/tahun/tahun kabisat, koreksi nama kontak, negasi deal, kutipan instruksi yang tidak dipercaya, Unicode/tanda kutip, dan laporan panjang.
- Groq menerima body produksi yang sama: `messages` terpisah, `temperature: 0`, `max_tokens: 500`, `response_format: {type: "json_object"}`. Prompt produksi `extractReport` dipakai tanpa perubahan, dengan tanggal fixture deterministik.
- Endpoint publik Kyio hanya menyatakan `GET ?q=...`; prompt sistem dan laporan digabung. Tidak ada bukti kontrak bahwa endpoint publik ini menyediakan role terpisah atau JSON mode. **Ini pembandingan antarmuka yang tersedia, bukan eksperimen model dengan seluruh parameter identik.**
- Angka latensi adalah wall-clock klien termasuk network/handshake, tanpa retry otomatis. Dua set Kyio dapat tumpang-tindih, masing-masing memulai request minimal 25 detik sekali; ini bukan uji beban atau upaya menghabiskan kuota. Pembacaan dokumentasi oleh satu subagent tidak seluruhnya mematuhi pacing internal; penyimpangannya dicatat di laporan operasional. Tidak ada respons 429 yang diamati, dan tidak ada bypass/rate-limit probing.
- Nilai field dibandingkan dengan ekspektasi fixture; normalisasi hanya kapitalisasi, whitespace, dan titik akhir. Nama entitas yang berbeda tidak dianggap sama. JSON diagnostik yang dibaca dari fenced Markdown **tidak** dihitung sebagai JSON langsung yang valid.
- Identitas model hanya label provider, bukan bukti vendor/upstream model yang sebenarnya. Pengulangan yang identik tidak membuktikan independensi inferensi; cache/upstream routing tidak diaudit.

## Hasil set utama

| Metrik | Groq gpt-oss-20b | Kyio label Claude | Kyio label GPT-5 |
|---|---:|---:|---:|
| Jumlah percobaan | 20 | 20 | 10 (subset) |
| HTTP 200 | 20/20 | 20/20 | 10/10 |
| Isi model langsung berupa objek JSON valid | 20/20 | 0/20 | 9/10 |
| JSON + schema + nilai field sesuai ekspektasi, sebelum adapter | 20/20 | 0/20 | 8/10 |
| Akurasi field diagnostik, setelah membaca JSON dari Markdown | 120/120 | 116/120 | 59/60 |
| Median latensi | 0,816 detik | 8,936 detik | 4,722 detik |
| P95 latensi, nearest-rank | 0,922 detik | 9,861 detik | 6,085 detik |

Data: [`chat-results.json`](kyio-evaluation/chat-results.json), [`alternate-results.json`](kyio-evaluation/alternate-results.json). Jumlah fixture berbeda untuk GPT-5; pada sepuluh kasus Groq yang sama median Groq adalah 0,797 detik. GPT-5 Kyio sekitar 5,9 kali lebih lambat pada subset itu. Sampel kecil ini tidak membuktikan uptime, P95 jangka panjang, kapasitas kuota, atau performa produksi edge.

### Kesalahan konkret

1. **Kyio label Claude: 20/20 respons utama memakai fenced Markdown**, tujuh di antaranya juga memiliki penjelasan setelah blok JSON. Envelope publiknya `result.answer`, bukan `choices[0].message.content`. Mengganti URL saja gagal.
2. **Tahap diada-adakan tiga kali:** fixture secara eksplisit menyatakan tahap deal belum diketahui, tetapi Kyio Claude menetapkan `Kunjungan awal` pada percobaan awal dan dua pengulangannya. Setelah adapter JSON sekalipun, kesalahan makna ini tetap tersimpan sebagai tahap yang sah.
3. **Tanggal kosong:** Kyio Claude pada laporan tanpa fakta, dan Kyio GPT-5 pada laporan tidak lengkap, mengembalikan `followup_date: ""` alih-alih default +3 hari. Parser produksi Weppy memang memperbaiki ini menjadi +3 hari; karena itu kesalahan raw output ini dipisahkan dari hasil akhir aplikasi.
4. **Kyio label GPT-5:** satu respons Inggris dibungkus Markdown. Sembilan lainnya berupa JSON langsung; delapan langsung memenuhi schema/nilai. Menghapus satu wrapper Markdown dan memakai default tanggal produksi membuat sepuluh fixture subset lolos, tetapi itu baru bukti adapter diagnostik, bukan migrasi yang sudah diterapkan atau jaminan generalisasi.
5. Struktur dua endpoint Kyio berbeda: Claude menghasilkan teks di `result.answer`, GPT-5 di `result.result`. Klaim “one JSON contract” tidak membuat keduanya drop-in compatible dengan Groq.

## Replay parser produksi, bukan parser tiruan

Seluruh `src/worker.ts` dibundel **di memori**. Fungsi `extractReport` asli dijalankan dengan respons HTTP live yang telah disimpan; tanggal dibekukan per fixture. Adapter hanya diaplikasikan pada data replay, tidak pada kode aplikasi.

| Provider / perlakuan respons | Parser menerima | Semua field akhir sesuai fixture |
|---|---:|---:|
| Groq, parser tidak diubah | 23/24 | 22/24 |
| Kyio Claude, respons tidak diubah | 0/24 | 0/24 |
| Kyio Claude, envelope + ambil objek JSON fenced | 24/24 | 20/24 |
| Kyio GPT-5, respons tidak diubah | 0/10 | 0/10 |
| Kyio GPT-5, envelope saja | 9/10 | 9/10 |
| Kyio GPT-5, envelope + hapus wrapper Markdown | 10/10 | 10/10 |

Data: [`parser-replay.json`](kyio-evaluation/parser-replay.json), [`edge-results.json`](kyio-evaluation/edge-results.json). Hasil ini membuktikan kompatibilitas parser dengan respons tersimpan, bukan D1, webhook Telegram, kredensial, atau jaringan deployment edge.

### Kekurangan Groq yang ikut ditemukan

- Uji nama institusi buatan yang sangat panjang menghasilkan **HTTP 400 `json_validate_failed`**, bukan laporan JSON. Tidak diulang untuk menyembunyikan kegagalan. Ini membuat hasil gabungan Groq 23/24 HTTP sukses, meskipun set utama 20/20 lolos.
- Pada rantai voice Indonesia, STT menuliskan `perusahaan contoh Nusantara`; ekstraksi Groq menyimpan institusi `Nusantara`, bukan `Contoh Nusantara`. Tidak ada fakta lain yang berubah. Ini kehilangan sebagian nama menurut ekspektasi fixture; kata `contoh` yang menjadi huruf kecil bisa ambigu, sehingga jangan mengekstrapolasi satu kasus ini menjadi akurasi bahasa Indonesia secara umum.
- Kyio Claude menerima nama panjang tetapi memendekkannya lebih jauh daripada pemotongan tepat 80 karakter yang diharapkan fixture. Ini kegagalan ekspektasi truncation yang sengaja ketat, bukan klaim bahwa seluruh nama panjang tidak terbaca.
- Tiga detik hening pada Groq Whisper menghasilkan teks **`you`**. Ini hallucination STT yang nyata dan perlu ditangani bila kualitas voice akan diperbaiki, tetapi tidak membuktikan Kyio lebih baik.

## STT dan TTS

| Fixture STT Groq | Durasi audio | Latensi | Fakta kunci terpelihara |
|---|---:|---:|---:|
| Indonesia bersih | 16,10 detik | 0,572 detik | 6/6 |
| Inggris bersih | 14,55 detik | 0,621 detik | 6/6 |
| Indonesia + pink noise | 16,10 detik | 0,568 detik | 6/6 |
| Hening sintetis | 3,01 detik | 0,330 detik | Tidak berlaku; output `you` |

Data: [`audio-results.json`](kyio-evaluation/audio-results.json), dengan hash, codec Opus, 48 kHz mono, transkrip, referensi, dan metrik WER literal. WER literal menganggap angka tertulis menjadi digit sebagai perbedaan meskipun maknanya sama; jangan gunakan WER tersebut sendirian sebagai ukuran akurasi semantik. Noise tidak dikalibrasi ke SNR tertentu. Ini bukan cakupan mikrofon nyata, dialek, banyak pembicara, seluruh format, atau batas 20 MB.

**Pembaruan UniScribe:** screenshot pengguna memberikan route `GET/POST /api/v2/ai/transcribe`. Upload multipart field `file` berisi OGG/Opus berhasil tanpa key untuk Indonesia, Inggris dan Indonesia ber-noise: keduanya mempertahankan 18/18 fakta kunci dan 3/3 tanggal. Median UniScribe **25,61 detik**, dibanding baseline Groq baru **0,55 detik** pada tiga file yang sama. Permintaan keempat (audio hening) mendapat **HTTP 429** dan seluruh panggilan Kyio dihentikan tanpa retry; kualitas hening, URL-mode dan live upload Worker belum teruji. Respons teks berada di `result.text`, sehingga parser produksi yang membaca `text` perlu adapter. Metadata bahasa audio Inggris tetap `id`; respons juga memberikan signed audio URL dengan kedaluwarsa 24 jam, bukan jaminan penghapusan. Bukti lengkap dan tabel ada di [evaluasi audio terbaru](kyio-audio-evaluation.md) serta [`uniscribe-results.json`](kyio-evaluation/uniscribe-results.json). **TTS tetap belum diuji:** route ini adalah Speech-to-Text, bukan Text-to-Speech.

## Runtime, autentikasi, validasi, dan kapasitas

- **Local Cloudflare workerd:** satu request generasi `gpt-5` berhasil, HTTP 200, 6,113 detik, konten `{"ok":true}` di `result.result`. Ini membuktikan primitive `fetch` bekerja dari runtime lokal, bukan bahwa deployment Cloudflare publik lolos whitelist/anti-bot atau memiliki IP egress statis. Data: [`worker-smoke.json`](kyio-evaluation/worker-smoke.json).
- **OpenAI-compatible tanpa key:** `POST /v1/chat/completions` menghasilkan 401 `invalid_api_key`. Belum diuji: key valid, `response_format`, pemisahan role, `temperature`, `max_tokens`, model, streaming, dan payload audio berbayar. Data: [`auth-results.json`](kyio-evaluation/auth-results.json).
- **Parameter wajib:** endpoint publik Claude tanpa `q` mengembalikan 400 `MISSING_PARAMETER`, bukan respons palsu. Data: [`validation-results.json`](kyio-evaluation/validation-results.json).
- Semua 34 respons ekstraksi publik Kyio yang diukur menunjukkan `x-ratelimit-limit: 1000`; dokumen menyebut free 10 RPM. Respons parameter-kosong juga memberi limit 1000 dan reset 60. **Tidak disimpulkan bahwa quota sebenarnya 1000 RPM:** satu header tidak menjelaskan bucket, paket, konfigurasi edge, atau jaminan enforcement. Tidak ada uji kehabisan kuota, concurrency tinggi, 429, atau recovery outage.
- [Pricing](https://api.kyio.web.id/pricing) menyebut Community 10 RPM, Starter Rp10.000/bulan 120 RPM per key, Lifetime Rp30.000 sekali bayar 120 RPM berbasis IP whitelist. [Panduan key](https://api.kyio.web.id/docs/api-keys) menyebut paid 15.000 request/hari, sementara [policy](https://api.kyio.web.id/api-policy) menyebut Donation Plan 10.000/hari. Kapasitas aktual belum dapat dipastikan.
- Jalur GET publik membawa isi laporan di URL. URL dapat masuk ke log teknis; tidak ada klaim terukur bahwa Kyio benar-benar menyimpan seluruh query, tetapi ini risiko yang perlu diklarifikasi sebelum data customer dipakai.
- [Privacy](https://api.kyio.web.id/privacy) membahas log operasional tujuh hari, bukan komitmen jelas untuk retensi prompt/audio/output di semua upstream. Izin backend bot multi-user versus larangan resale/proxy pada policy juga belum jelas; tidak disimpulkan bahwa integrasi aplikasi pasti melanggar. [Terms](https://api.kyio.web.id/terms) best-effort/as-is, bukan SLA endpoint yang terbukti.
- Untuk Worker, autentikasi key lebih masuk akal dievaluasi daripada mengandalkan whitelist satu IP. Bukti yang dibaca tidak menjamin egress tetap untuk `fetch` Worker ini. Tidak ada deployment/route egress yang diubah. Penjelasan dan sumber Cloudflare ada di [evaluasi operasional](kyio-operational-evaluation.md).

## Keputusan dan syarat uji berikutnya

1. **Pengganti penuh Groq sekarang: tidak lulus / belum terbukti.** STT UniScribe berhasil pada tiga audio ucapan, tetapi median sekitar 46,6 kali baseline Groq dan request keempat ditolak 429. Chat berbayar belum dapat diuji; endpoint publik bukan pengganti langsung. Jangan memigrasikan deployment berdasarkan subset sepuluh kasus teks atau tiga audio sukses.
2. **Kyio publik label Claude: tidak direkomendasikan untuk ekstraksi produksi Weppy.** Memerlukan adapter format lebih agresif, median lebih lambat, dan ada fabrikasi tahap yang tetap lolos parser. Memperbaiki wrapper saja tidak memperbaiki makna.
3. **Kyio publik label GPT-5: kandidat eksperimen teks paling menjanjikan dari dua yang diuji.** Setelah adapter envelope + Markdown dan default tanggal produksi, hasil subset 10/10 sesuai; latensi lebih tinggi, sampel kecil dan skenario lebih sempit. Belum membuktikan 24/24, ketahanan beban, atau identitas upstream.
4. Agar penilaian chat berbayar dapat diselesaikan, pemilik dapat menyediakan `KYIO_API_KEY` secara lokal melalui `.env` (jangan chat/commit key). Untuk UniScribe, klarifikasi kuota/upstream 429 dan retensi audio; kontrak upload STT sudah diuji tanpa key. Diperlukan kontrak TTS jika fitur keluaran suara ingin dinilai, serta izin/ketentuan penggunaan yang jelas. Setelah itu jalankan set fixture yang sama melalui `/v1/chat/completions` dan uji audio/Worker yang tersisa dari lingkungan yang diotorisasi. Tidak melakukan pembelian atau signup otomatis.
5. Tetap terima secara eksplisit sifat best-effort bila sesuai tujuan demo; SLA enterprise bukan syarat otomatis. Yang wajib adalah tidak mengklaim retensi data, kapasitas, model atau kemampuan audio tanpa bukti, dan memenuhi kebutuhan produk yang benar-benar ingin dipertahankan.

## Bukti dan reproduksi

Bukti tersimpan di `devpost/kyio-evaluation/`; hanya data fiktif/sintetis. Tidak ada secret dalam artefak. Hash `src/worker.ts` setelah evaluasi cocok dengan hash sebelum benchmark. Tidak ada perubahan pada callsite/tests/docs produk karena tidak ada cutover fitur; laporan ini adalah deliverable investigasi.

Offline, tanpa memanggil API lagi:

```bash
.venv/bin/python scripts/evaluate-kyio.py --rescore
node scripts/replay-kyio-parser.mjs
```

Pembaruan STT setelah screenshot (offline, tanpa retry provider):

```bash
.venv/bin/python scripts/evaluate-kyio-uniscribe.py --summarize
node scripts/replay-uniscribe-parser.mjs
```

Ulangi live hanya bila memang ingin memakai kuota provider lagi dan penolakan 429/akses sudah dipahami; perintah berikut adalah reproduksi evaluasi awal, **bukan anjuran retry UniScribe setelah 429**. Jalankan set secara berurutan agar konservatif terhadap limit:

```bash
.venv/bin/python scripts/evaluate-kyio.py
.venv/bin/python scripts/evaluate-kyio-alternate.py
.venv/bin/python scripts/evaluate-kyio-audio.py
.venv/bin/python scripts/evaluate-kyio-edges.py
node scripts/smoke-kyio-worker.mjs
.venv/bin/python scripts/evaluate-kyio.py --rescore
node scripts/replay-kyio-parser.mjs
```

Fixture OGG disimpan agar pengukuran STT bisa direproduksi tanpa sintesis ulang. Skrip membaca key Groq lokal, tidak mempublikasikannya. Key Kyio tidak diperlukan oleh skrip public-route saat ini; menambahkannya saja tidak otomatis mengubah benchmark menjadi uji premium. Pemeriksaan kode yang dijalankan: sintaks Python/Node, live HTTP, metadata audio, replay parser produksi, dan satu smoke outbound `workerd`. Tidak menjalankan suite aplikasi karena tidak ada perubahan fitur aplikasi.
