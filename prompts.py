"""Bilingual agent strings (see spec.md > Look and Feel, prd.md > 7).

All user-facing sentences live here in Indonesian + English.
The router picks by profile["language"] — never per-message detection.
Slice 2 ships onboarding + greeting + settings strings;
slices 3-6 append card / clarification / reminder / recap strings.
"""

STRINGS = {
    "id": {
        "onboarding_name": (
            "Halo! Saya asisten sales. Siapa nama panggilanmu? "
            '(Balas nama, atau "Skip" untuk lewati.)'
        ),
        "onboarding_lang": (
            "Pilih bahasa / Choose language: balas *Indonesia* atau *English*. "
            '(Atau "Skip" = Indonesia.)'
        ),
        "onboarding_time": (
            "Jam berapa rekap sore dikirim tiap hari? Balas format HH:MM, "
            'mis. 17:00. (Atau "Skip" = 17:00.)'
        ),
        "onboarding_time_invalid": (
            'Format jam tidak dikenali. Balas HH:MM (mis. 17:00) atau "Skip".'
        ),
        "onboarding_done": (
            "Siap, {name}! Bahasa: {lang_label}, rekap sore jam {time}.\n"
            "Coba kirim laporan kunjungan, mis:\n"
            '"Baru dari PT Maju Jaya ketemu Ibu Sari purchasing, '
            'bahas kopi 100kg, minta penawaran harga."'
        ),
        "lang_label": "Indonesia",
        "name_updated": "Siap, mulai sekarang saya panggil {name}.",
        "lang_updated": "Siap, bahasa diganti ke Indonesia.",
        "time_updated": "Siap, rekap sore dikirim jam {time}.",
        "time_invalid": 'Format jam tidak dikenali. Contoh: "ubah jam rekap ke 17:00".',
        "fallback": (
            "Pesan diterima. Ekstraksi laporan teks belum aktif "
            '(slice 3). Kirim "ping" untuk tes koneksi.'
        ),
        "ai_busy": (
            "Otak AI sedang sibuk/limit, coba kirim ulang 1 menit lagi ya. "
            "Catatan belum disimpan."
        ),
        "vn_download_fail": (
            "Voice note gagal diunduh (link kedaluwarsa). "
            "Tolong kirim ulang voice note-nya."
        ),
        "vn_unclear": (
            "Maaf, suaranya kurang jelas jadi saya tidak buatkan catatan "
            "karangan. Boleh ulangi bagian yang kurang jelas, atau ketik "
            "laporannya sebagai teks?"
        ),
        "vn_no_media": (
            "Di jalur uji ini voice note tidak bisa diunduh, jadi ketik "
            "laporannya sebagai teks ya."
        ),
        "report_empty": (
            "Saya tidak menemukan info laporan di pesan itu, jadi tidak "
            "ada yang disimpan. Coba kirim ulang dengan menyebut "
            "perusahaan, kontak, atau produk — atau ketik \"rekap\" untuk "
            "rekap, \"cek follow-up\" untuk pengingat."
        ),
    },
    "en": {
        "onboarding_name": (
            'Hello! I\'m the sales assistant. What\'s your nickname? '
            '(Reply with a name, or "Skip" to skip.)'
        ),
        "onboarding_lang": (
            "Pilih bahasa / Choose language: reply *Indonesia* or *English*. "
            '(Or "Skip" = Indonesian.)'
        ),
        "onboarding_time": (
            "What time should I send the daily recap? Reply HH:MM, "
            'e.g. 17:00. (Or "Skip" = 17:00.)'
        ),
        "onboarding_time_invalid": (
            'Time not recognized. Reply HH:MM (e.g. 17:00) or "Skip".'
        ),
        "onboarding_done": (
            "All set, {name}! Language: {lang_label}, recap at {time}.\n"
            "Try sending a visit report, e.g.:\n"
            '"Just visited PT Maju Jaya, met Mrs Sari from purchasing, '
            'discussed 100kg coffee, they asked for a price quote."'
        ),
        "lang_label": "English",
        "name_updated": "Got it, I'll call you {name} from now on.",
        "lang_updated": "Done, language switched to English.",
        "time_updated": "Done, daily recap will be sent at {time}.",
        "time_invalid": 'Time not recognized. Example: "change recap time to 17:00".',
        "fallback": (
            "Message received. Text-report extraction isn't active yet "
            '(slice 3). Send "ping" to test the connection.'
        ),
        "ai_busy": (
            "The AI is busy/rate-limited, please resend in 1 minute. "
            "Nothing was saved."
        ),
        "vn_download_fail": (
            "Voice note download failed (link expired). "
            "Please resend the voice note."
        ),
        "vn_unclear": (
            "Sorry, the audio was unclear so I didn't make up a note. "
            "Could you repeat the unclear part, or type the report as text?"
        ),
        "vn_no_media": (
            "Voice notes can't be downloaded on this trial channel, "
            "so please type the report as text."
        ),
        "report_empty": (
            "I couldn't find any report info in that message, so nothing "
            "was saved. Try again mentioning the company, contact, or "
            "product — or type \"recap\" for the recap, \"check follow-up\" "
            "for reminders."
        ),
    },
}

SKIP_WORDS = {"skip", "lewati", "lewat", "/skip"}


def t(lang: str, key: str) -> str:
    return STRINGS.get(lang, STRINGS["id"]).get(key, STRINGS["id"][key])


CLARIFY = {
    "id": {
        "institusi": 'Perusahaan/institusinya apa? (Balas jawabannya, atau "Skip" bila belum tahu.)',
        "kontak": 'Siapa nama contact person-nya? (Balas, atau "Skip".)',
        "role": 'Apa role/jabatan contact person tersebut? (Balas, atau "Skip".)',
        "produk": 'Produk/layanan apa yang dibahas? (Balas, atau "Skip".)',
        "tahap_deal": (
            "Tahap deal saat ini apa? Mis: Kunjungan awal, Penawaran harga, "
            'Negosiasi, Deal, Follow-up. (Balas, atau "Skip".)'
        ),
        "saved": "Tersimpan. {filled}/5 info terisi.",
    },
    "en": {
        "institusi": 'Which company/institution? (Reply, or "Skip" if unknown.)',
        "kontak": 'Who is the contact person? (Reply, or "Skip".)',
        "role": 'What is their role/job title? (Reply, or "Skip".)',
        "produk": 'Which product/service was discussed? (Reply, or "Skip".)',
        "tahap_deal": (
            "What is the current deal stage? E.g.: Kunjungan awal, Penawaran harga, "
            'Negosiasi, Deal, Follow-up. (Reply, or "Skip".)'
        ),
        "saved": "Saved. {filled}/5 fields filled.",
    },
}


def clarify_question(lang: str, field: str) -> str:
    return CLARIFY.get(lang, CLARIFY["id"]).get(field, CLARIFY["id"][field])
