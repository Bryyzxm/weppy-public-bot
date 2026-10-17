# Evaluasi audio Kyio: UniScribe versus Groq Whisper

## Keputusan terbaru

**STT Kyio tersedia dan sudah berhasil diuji.** Screenshot pengguna mengidentifikasi `GET/POST /api/v2/ai/transcribe` dengan nama “AI Speech-to-Text Transcribe (UniScribe)”. Ini memperbarui temuan awal: hambatan sebelumnya adalah kontrak endpoint yang belum diketahui, bukan ketiadaan layanan.

**Belum direkomendasikan menggantikan Groq Whisper untuk voice note interaktif Weppy.** Tiga audio berisi ucapan berhasil ditranskripsikan dengan fakta kunci terpelihara, tetapi median latensi UniScribe 25,61 detik versus Groq 0,55 detik pada file yang sama. Permintaan keempat mendapat HTTP 429; pengujian dihentikan tanpa retry. TTS tetap belum diuji karena screenshot ini adalah Speech-to-Text, bukan Text-to-Speech.

Tidak ada deployment, aplikasi, key provider, pesan Telegram, database, atau data pelanggan yang diubah. Semua audio sintetis; tidak meneruskan URL download Telegram yang mengandung token bot.

## Kontrak yang benar-benar terverifikasi

Sumber endpoint: screenshot dokumentasi dari pengguna; hasil request live ke [endpoint UniScribe](https://api.kyio.web.id/api/v2/ai/transcribe), 15 Oktober 2026.

- `GET` tanpa input mengembalikan HTTP 400: `Parameter 'url' atau unggahan file audio/video wajib disertakan.` Ini menunjukkan nama input `url` dan dukungan upload menurut validasi, **bukan** bukti URL-mode sudah berhasil.
- `POST multipart/form-data` dengan field **`file`**, filename `voice.ogg`, MIME **`audio/ogg`** berhasil tanpa API key pada tiga file ucapan.
- File yang diuji: OGG/Opus mono 48 kHz, durasi 14,55–16,10 detik, ukuran sekitar 45–50 KB. Tidak mengklaim seluruh format, video, durasi atau batas ukuran didukung.
- Tidak mengirim field `model`, `language`, atau `response_format`. Nilai default/opsi tambahan belum didokumentasikan atau diuji.
- Respons sukses memakai **`status: true` dan `result.text`**, beserta `id`, `duration`, `language`, `segments`, `audioUrl`, `fileType`, `fileSize`.
- Respons audio Inggris memuat transkrip Inggris yang benar, tetapi **`language: "id"`**. Jangan menggunakan metadata ini sebagai bukti deteksi bahasa yang benar; mungkin default atau metadata yang salah, penyebabnya belum diketahui.

Contoh bentuk request yang telah berhasil, tanpa menyertakan credential:

```bash
curl --max-time 90 \
  -F 'file=@devpost/kyio-evaluation/voice-id.ogg;type=audio/ogg' \
  'https://api.kyio.web.id/api/v2/ai/transcribe'
```

Jangan menjalankan ulang contoh ini untuk mengabaikan HTTP 429. Kuota upstream/akses perlu diklarifikasi dan layanan pulih sebelum pengujian baru diotorisasi.

## Hasil live pada fixture yang sama

| Audio sintetis | UniScribe | Groq, baseline baru | Fakta kunci / tanggal |
|---|---:|---:|---|
| Indonesia bersih, 16,10 detik | HTTP 200; 35,49 detik | HTTP 200; 0,55 detik | Keduanya 6/6 fakta; tanggal benar |
| Inggris bersih, 14,55 detik | HTTP 200; 25,61 detik | HTTP 200; 0,47 detik | Keduanya 6/6 fakta; tanggal benar |
| Indonesia + noise, 16,10 detik | HTTP 200; 16,90 detik | HTTP 200; 0,59 detik | Keduanya 6/6 fakta; tanggal benar |
| Hening, 3,01 detik | HTTP 429 setelah 4,15 detik | Tidak diulang setelah penolakan Kyio | Kualitas hening UniScribe tidak dapat dinilai |

- Median tiga request ucapan UniScribe **25,613 detik**; Groq **0,549 detik** — sekitar **46,6 kali lebih lambat** pada sampel ini, bukan jaminan rasio semua beban.
- Sukses tiga dari empat percobaan UniScribe adalah hasil sampel, **bukan estimasi SLA/availability produksi**. Tidak ada stress test atau concurrency tinggi.
- Request tambahan dimulai minimal 25 detik terpisah; tidak ada retry otomatis. HTTP 429 muncul dengan body `ERR_BAD_REQUEST: Request failed with status code 429`, meskipun header menyatakan remaining 960 dan limit 1000. Asal throttling gateway versus upstream tidak terbukti; header ini bukan jaminan kuota audio yang masih tersedia.
- Setelah 429, tidak ada request Kyio lanjutan. Uji URL-mode, upload berulang dan live upload Worker tidak dijalankan. Baseline Groq hening yang lebih awal menghasilkan `you`; hasil itu historis, bukan pasangan baru untuk respons 429.
- Noise sintetis tidak dikalibrasi ke SNR; nama institusi/contoh mengikuti fixture. Corpus ini tidak mencakup dialek, mikrofon nyata, multi-speaker, file besar, rekaman panjang atau seluruh kemungkinan error.

## Kompatibilitas parser Weppy

`src/worker.ts > transcribe` membaca `decoded.text`. UniScribe menaruh teks di `decoded.result.text`. Replay offline menjalankan **fungsi produksi asli** dengan respons live tersimpan:

- Respons UniScribe tidak diadaptasi: tiga HTTP 200 menghasilkan string kosong, bukan transkrip.
- Adapter diagnostik `{text: response.result.text}`: ketiga transkrip diterima dan cocok.
- HTTP 429 tetap ditolak oleh jalur error; tidak diubah menjadi transkrip kosong yang dianggap berhasil.

Ini bukti adapter respons diperlukan, **bukan** migrasi aplikasi yang sudah diterapkan. Telegram getFile/download pada replay adalah test double offline; tidak membuktikan upload lewat Worker edge, webhook end-to-end, D1 atau timeout produksi. Primitive multipart Worker belum diuji live untuk route ini karena pengujian dihentikan setelah 429.

## Audio dan retensi

Ketiga respons sukses mengembalikan `audioUrl` bertanda tangan ke host R2, dengan `X-Amz-Expires=86400` (24 jam). URL ditahan hanya untuk rencana uji file sintetis dan kemudian **disensor pada artefak**; token URL tidak dipublikasikan dalam laporan. Tidak ada fetch untuk membuktikan objeknya dapat diunduh atau mengecek penghapusan.

**Masa berlaku akses URL bukan masa retensi file.** Respons ini tidak menjelaskan kapan objek audio, transkrip, backup atau hasil upstream dihapus. [Privacy Kyio](https://api.kyio.web.id/privacy) yang membahas purge log operasional tujuh hari tidak cukup menjawab retensi konten audio. Klarifikasi sebelum mengirim voice note pelanggan.

Untuk integrasi Telegram, jangan kirim URL `api.telegram.org/file/bot<TOKEN>/...` sebagai input `url` ke pihak ketiga: itu akan membocorkan token bot. Jalur upload bytes/file yang diuji menghindari penerusan URL ber-credential.

## Bukti dan batas yang tersisa

- [`uniscribe-results.json`](kyio-evaluation/uniscribe-results.json): 4 percobaan UniScribe, 3 baseline Groq baru, input hash, transkrip, metadata, score, 429 dan stop reason.
- [`uniscribe-initial-results.json`](kyio-evaluation/uniscribe-initial-results.json): permintaan Indonesia pertama, dihitung satu kali di laporan gabungan; signed URL disensor.
- [`uniscribe-parser-replay.json`](kyio-evaluation/uniscribe-parser-replay.json): perilaku fungsi produksi tanpa/dengan adapter diagnostik.
- [`audio-results.json`](kyio-evaluation/audio-results.json): baseline Groq sebelumnya dan fixture; tetap disimpan sebagai snapshot historis sebelum screenshot diberikan.
- [`scripts/evaluate-kyio-uniscribe.py`](../scripts/evaluate-kyio-uniscribe.py) dan [`scripts/replay-uniscribe-parser.mjs`](../scripts/replay-uniscribe-parser.mjs): harness pengujian. Offline tanpa API baru: `.venv/bin/python scripts/evaluate-kyio-uniscribe.py --summarize` lalu `node scripts/replay-uniscribe-parser.mjs`.

Belum diuji: URL-mode positif, pengulangan stabilitas, silence yang menghasilkan transkrip, batas file/durasi/format, parameter bahasa, diarization, live Worker upload/deployed edge, ketahanan kuota/concurrency, pemulihan 429, identitas mesin STT upstream, dan penghapusan audio. **TTS juga tetap belum diuji.**

Kesimpulan: **sudah terbukti bisa transkripsi gratis tanpa key untuk sampel kecil; belum layak menjadi pengganti utama Groq untuk bot ini berdasarkan latensi, penolakan 429 dan ketidakjelasan retensi.** Dapat dipertimbangkan untuk eksperimen non-interaktif setelah batas penggunaan dan privasinya diklarifikasi; tidak ada cutover otomatis.
