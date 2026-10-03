---
doc: scope
status: approved
---

# Asisten Sales WhatsApp B2B

Asisten WhatsApp pribadi untuk sales B2B yang mengubah voice note atau pesan teks setelah kunjungan menjadi catatan pipeline yang rapi, lalu membantu follow-up dan rekap harian.

## The Unique Kernel

Sales cukup bercerita lewat voice note atau mengetik setelah kunjungan. Agent memahami isi laporan, menangkap data yang belum ada, menanyakan detail yang kurang, dan selalu memberi opsi **Skip** jika informasi belum pasti. Dengan begitu, sales tidak perlu mengisi CRM secara manual atau mengarang data yang belum diketahui.

## Who It's For

Sales B2B yang sering berpindah dari satu kunjungan klien ke kunjungan lain dan perlu mencatat hasil percakapan dengan cepat. Saat ini mereka berisiko menunda pencatatan, lupa detail, atau melewatkan follow-up karena administrasi dilakukan setelah aktivitas lapangan.

## The Core Loop

Sales mengirim voice note atau pesan teks ke nomor WhatsApp uji setelah kunjungan. Agent mengekstrak dan menyimpan empat informasi inti: **institusi atau perusahaan, contact person beserta rolenya, produk/layanan yang dibahas, dan tahap deal yang sedang berlangsung**. Jika ada informasi yang belum lengkap, agent bertanya secara bertahap dan menawarkan Skip. Setelah catatan tersimpan, agent dapat mengingatkan follow-up dan mengirim rekap pipeline pada sore hari, sehingga sales kembali menggunakan asisten setiap selesai kunjungan dan saat memeriksa progres.

## Inspiration & Identity

Interaksi harus terasa seperti chat WhatsApp yang singkat, praktis, dan membantu—bukan seperti mengisi formulir CRM. Agent sebaiknya proaktif saat menemukan informasi yang kurang, tetapi tidak menghambat sales ketika informasi memang belum diketahui.

## Why This Matters to the Learner

Proyek ini memberi kesempatan untuk memahami workflow dan cara kerja AI agent secara lebih dalam melalui kasus nyata: menerima input teks atau suara, mengekstrak informasi, mengelola percakapan klarifikasi, menyimpan state, dan menjalankan pengingat atau rekap otomatis.

## What "Working" Looks Like

Dalam mode uji coba Meta WhatsApp Cloud API, satu sales mengirim teks atau voice note ke satu nomor WhatsApp uji. Agent membalas, menanyakan field yang kurang dengan opsi Skip, lalu menyimpan catatan yang memuat institusi/perusahaan, contact person dan rolenya, produk/layanan yang dibahas, serta tahap deal saat ini. Sales kemudian dapat menerima pengingat follow-up dan melihat rekap pipeline harian di WhatsApp.

Momen “oh, ini berguna” adalah ketika voice note yang tidak terstruktur berubah menjadi catatan pipeline yang rapi, dan agent sendiri menemukan detail yang belum disebut tanpa memaksa sales mengisi data yang belum pasti.

## The POC Boundary

Yang termasuk:

- Konfigurasi awal Meta Developer dan WhatsApp Cloud API dalam mode uji coba.
- Satu nomor WhatsApp pengirim uji dan satu alur untuk satu sales.
- Penerimaan pesan teks dan voice note dari WhatsApp.
- Ekstraksi empat informasi inti: institusi atau perusahaan, contact person beserta rolenya, produk/layanan yang dibahas, dan tahap deal yang sedang berlangsung.
- Klarifikasi adaptif untuk field yang belum ada, dengan pilihan Skip.
- Penyimpanan catatan pipeline untuk demo.
- Pengingat follow-up dan rekap pipeline harian yang dapat didemokan.

## Later

- Banyak sales, banyak nomor, dan pembagian akses berdasarkan tim.
- Integrasi CRM produksi seperti Salesforce atau HubSpot.
- Dashboard web dan analitik performa sales.
- Sinkronisasi kalender, notifikasi multi-channel, dan aturan follow-up yang kompleks.
- Deployment produksi dengan reliability, monitoring, dan pengelolaan volume tinggi.

## Explicitly Cut

- Sistem CRM lengkap: tidak diperlukan untuk membuktikan workflow agent inti.
- Otomatisasi WhatsApp produksi untuk banyak pengguna: membutuhkan konfigurasi, keamanan, dan operasi yang melampaui proof of concept.
- Fitur penjualan seperti scoring lead, rekomendasi harga, atau prediksi closing: bukan bagian dari masalah pencatatan dan follow-up yang ingin dibuktikan.
- Integrasi ke nomor WhatsApp pribadi yang tidak didukung API resmi: berisiko dan tidak diperlukan untuk demo.
