# Asisten Sales WhatsApp B2B

Asisten WhatsApp untuk sales B2B: voice note/teks setelah kunjungan
jadi catatan pipeline rapi, plus pengingat follow-up dan rekap harian.

## Cara jalan (lokal)

1. `pip install -r requirements.txt`
2. Salin `.env.example` ke `.env`, isi token.
3. `python app.py` (jalan di `http://localhost:5000`)
4. Di terminal lain: `ngrok http 5000`, tempel URL ke Callback URL Meta:
   `https://xxx.ngrok-free.app/webhook` + Verify Token sama dengan `.env`.
5. Kirim `ping` dari WA uji → harus dibalas `pong`.

Slice 1: webhook + ping-pong + penyimpanan JSON lokal (`data/`).
