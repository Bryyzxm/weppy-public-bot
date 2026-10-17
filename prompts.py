"""Bilingual agent strings (see spec.md > Look and Feel, prd.md > 7).

All user-facing sentences live here in Indonesian + English.
The router picks by profile["language"] — never per-message detection.
Slice 2 ships onboarding + greeting + settings strings;
slices 3-6 append card / clarification / reminder / recap strings.
"""

STRINGS = {
    "id": {
        "onboarding_welcome": (
            "Selamat datang di *Asisten Sales B2B* \U0001f44b\n\n"
            "Saya bantu kamu catat laporan kunjungan jadi rapi — cukup kirim "
            "teks atau *voice note* setelah kunjungan, saya ekstrak jadi kartu "
            "4 field (perusahaan, kontak, produk, tahap deal), ingatkan follow-up, "
            "dan kirim rekap harian otomatis."
        ),
        "onboarding_name": (
            "Siapa nama panggilanmu? "
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
        "menu_body": (
            "Menu utama — ketuk tombol di bawah (atau ketik perintah):\n"
            "Kirim laporan baru, lihat rekap/follow-up, ubah pengaturan, "
            'atau minta bantuan. (Ketik "menu" kapan saja untuk tampilkan lagi.)'
        ),
        "help_text": (
            "Bantuan — cara pakai:\n"
            "• Kirim laporan: ketuk Kirim Laporan lalu kirim teks/voice note, mis:\n"
            '"Baru dari PT Maju Jaya ketemu Ibu Sari purchasing, '
            'bahas kopi 100kg, minta penawaran harga."\n'
            "• Rekap: ketuk Rekap (atau ketik \"rekap\") untuk rekap pipeline.\n"
            "• Follow-up: ketuk Follow-up (atau ketik \"cek follow-up\").\n"
            "• Ekspor: ketuk Ekspor CSV (atau ketik \"ekspor csv\") "
            "untuk unduh semua catatan sebagai file CSV.\n"
            "• Pengaturan: ketuk Pengaturan untuk ubah nama/bahasa/jam rekap.\n"
            '• Ketik "menu" untuk tampilkan menu lagi, "ping" untuk tes koneksi.'
        ),
        "settings_body": (
            "Pengaturan — ketuk tombol yang mau diubah "
            '(atau ketik "menu" untuk kembali).'
        ),
        "lapor_prompt": (
            "Silakan kirim laporan kunjungan sebagai teks atau voice note, mis:\n"
            '"Baru dari PT Maju Jaya ketemu Ibu Sari purchasing, '
            'bahas kopi 100kg, minta penawaran harga."'
        ),
        "lapor_has_draft": (
            "Masih ada draft yang belum lengkap. Selesaikan dulu pertanyaan di atas, "
            'atau mulai baru dengan "lapor baru ..." + isi laporan.'
        ),
        "setting_name_ask": "Siapa nama panggilan baru? Balas nama-nya.",
        "setting_time_ask": (
            "Jam berapa rekap sore dikirim? Ketuk tombol atau balas HH:MM "
            "(mis. 17:00, 12:00, atau 19:00)."
        ),
        "menu_lapor": "📝 Kirim Laporan",
        "menu_recap": "📊 Rekap",
        "menu_followup": "⏰ Follow-up",
        "menu_settings": "⚙️ Pengaturan",
        "menu_help": "❓ Bantuan",
        "menu_export": "📥 Ekspor CSV",
        "menu_main": "Menu Utama",
        "settings_name": "Ubah Nama",
        "settings_lang": "Ganti Bahasa",
        "settings_time": "Ubah Jam",
        "export_empty": (
            "Belum ada catatan tersimpan. Kirim laporan kunjungan dulu, "
            "baru ekspor CSV."
        ),
        "export_caption": (
            "Berikut file CSV berisi {n} catatan pipeline. "
            "Buka di Excel/Sheets ya."
        ),
    },
    "en": {
        "onboarding_welcome": (
            "Welcome to *B2B Sales Assistant* \U0001f44b\n\n"
            "I turn your visit reports into tidy cards — just send text or a "
            "*voice note* after a visit. I'll extract 4 fields (company, contact, "
            "product, deal stage), remind you to follow up, and send a daily recap."
        ),
        "onboarding_name": (
            'What\'s your nickname? '
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
        "menu_body": (
            "Main menu — tap a button below (or type a command):\n"
            'Send a new report, view recap/follow-ups, change settings, '
            'or ask for help. (Type "menu" anytime to show it again.)'
        ),
        "help_text": (
            "Help — how to use:\n"
            "• Send a report: tap Send Report then send text/voice note, e.g.:\n"
            '"Just visited PT Maju Jaya, met Mrs Sari from purchasing, '
            'discussed 100kg coffee, they asked for a price quote."\n'
            "• Recap: tap Recap (or type \"recap\") for the pipeline recap.\n"
            "• Follow-up: tap Follow-up (or type \"check follow-up\").\n"
            "• Export: tap Export CSV (or type \"export csv\") "
            "to download all notes as a CSV file.\n"
            "• Settings: tap Settings to change name/language/recap time.\n"
            '• Type "menu" to show the menu again, "ping" to test connection.'
        ),
        "settings_body": (
            'Settings — tap what to change (or type "menu" to go back).'
        ),
        "lapor_prompt": (
            "Please send the visit report as text or voice note, e.g.:\n"
            '"Just visited PT Maju Jaya, met Mrs Sari from purchasing, '
            'discussed 100kg coffee, they asked for a price quote."'
        ),
        "lapor_has_draft": (
            "There is still an incomplete draft. Please answer the question "
            'above first, or start fresh with "new report ..." + the report.'
        ),
        "setting_name_ask": "What is the new nickname? Reply with the name.",
        "setting_time_ask": (
            "What time should the daily recap be sent? Tap a button or reply "
            "HH:MM (e.g. 17:00, 12:00, or 19:00)."
        ),
        "menu_lapor": "📝 Send Report",
        "menu_recap": "📊 Recap",
        "menu_followup": "⏰ Follow-up",
        "menu_settings": "⚙️ Settings",
        "menu_help": "❓ Help",
        "menu_export": "📥 Export CSV",
        "menu_main": "Main Menu",
        "settings_name": "Change Name",
        "settings_lang": "Change Language",
        "settings_time": "Change Time",
        "export_empty": (
            "No notes stored yet. Send a visit report first, "
            "then export CSV."
        ),
        "export_caption": (
            "Here is the CSV file with {n} pipeline note(s). "
            "Open it in Excel/Sheets."
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
            "What is the current deal stage? E.g.: Initial visit, Price quote, "
            'Negotiation, Deal, Follow-up. (Reply, or "Skip".)'
        ),
        "saved": "Saved. {filled}/5 fields filled.",
    },
}


def clarify_question(lang: str, field: str) -> str:
    return CLARIFY.get(lang, CLARIFY["id"]).get(field, CLARIFY["id"][field])


# --- Button-based navigation (menu utama + preset) ---
# Button ids are stable across languages; titles are localized.
# All titles <= 20 chars (WhatsApp Cloud API limit).

def main_menu_buttons(lang: str) -> list:
    return [
        {"id": "menu_lapor", "title": t(lang, "menu_lapor")},
        {"id": "menu_recap", "title": t(lang, "menu_recap")},
        {"id": "menu_followup", "title": t(lang, "menu_followup")},
        {"id": "menu_export", "title": t(lang, "menu_export")},
        {"id": "menu_settings", "title": t(lang, "menu_settings")},
        {"id": "menu_help", "title": t(lang, "menu_help")},
    ]


def settings_menu_buttons(lang: str) -> list:
    return [
        {"id": "settings_name", "title": t(lang, "settings_name")},
        {"id": "settings_lang", "title": t(lang, "settings_lang")},
        {"id": "settings_time", "title": t(lang, "settings_time")},
        {"id": "menu_main", "title": t(lang, "menu_main")},
    ]


def time_preset_buttons() -> list:
    # 3 buttons max agar muat di WhatsApp (max 3/pesan).
    # Opsi lain tetap bisa diketik manual HH:MM.
    return [
        {"id": "time_08:00", "title": "08:00"},
        {"id": "time_17:00", "title": "17:00"},
        {"id": "skip", "title": "Skip"},
    ]


# Tahap deal: id stabil -> nilai kanonis Indonesia (pengelompokan stabil).
DEAL_ID_MAP = {
    "deal_awal": "Kunjungan awal",
    "deal_harga": "Penawaran harga",
    "deal_nego": "Negosiasi",
    "deal_deal": "Deal",
    "deal_fup": "Follow-up",
}

DEAL_EN_LABEL = {
    "Kunjungan awal": "Initial visit",
    "Penawaran harga": "Price quote",
    "Negosiasi": "Negotiation",
    "Deal": "Deal",
    "Follow-up": "Follow-up",
}


def tahap_deal_buttons(lang: str) -> list:
    out = []
    for bid, canonical in DEAL_ID_MAP.items():
        title = DEAL_EN_LABEL.get(canonical, canonical) if lang == "en" else canonical
        out.append({"id": bid, "title": title})
    out.append({"id": "skip", "title": "Skip"})
    return out
