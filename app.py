"""Flask webhook + chat router (slices 1-6).

Spec refs: Components (Webhook dan Chat Router; Kartu Teks, Klarifikasi
Skip, dan Onboarding), Data Model (profile.json), Decisions and Open
Issues (ping-pong proof before AI work).
"""

import os
import re

from dotenv import load_dotenv
from flask import Flask, jsonify, request

load_dotenv()

import store
import telegram
import whatsapp
from agent import FIELD_ORDER, GroqError, extract_report, missing_fields, new_note_id, render_card
from prompts import (
    SKIP_WORDS,
    DEAL_ID_MAP,
    clarify_question,
    main_menu_buttons,
    settings_menu_buttons,
    tahap_deal_buttons,
    time_preset_buttons,
    t,
)
import scheduler


def transport_module():
    mode = os.getenv("CHAT_TRANSPORT", "telegram").strip().lower()
    return telegram if mode == "telegram" else whatsapp

app = Flask(__name__)
store.ensure_data()

GREETINGS = {"halo", "hallo", "hai", "hello", "hi", "p", "assalamualaikum", "tes", "test"}

LANG_BUTTONS = [
    {"id": "lang_id", "title": "Indonesia"},
    {"id": "lang_en", "title": "English"},
    {"id": "skip", "title": "Skip"},
]
SKIP_BUTTON = [{"id": "skip", "title": "Skip"}]

# --- Button-based navigation (menu utama + pengaturan + bantuan) ---
# Id tombol stabil lintas bahasa; judul dilokalkan via prompts.t().
# Bekerja di Telegram (inline keyboard) + WhatsApp (interactive, max 3/pesan,
# fallback teks biasa di Twilio/Fonnte — body selalu memuat alternatif ketik).

MENU_COMMANDS = {"menu", "/menu", "/start", "menu utama", "utama", "main menu"}
HELP_COMMANDS = {"bantuan", "help", "/help", "tolong", "contoh", "info", "cara pakai"}
SETTINGS_MENU_COMMANDS = {"pengaturan", "pengaturan menu", "setting", "settings", "/settings"}

EXPORT_COMMANDS = {"ekspor csv", "export csv", "unduh csv", "download csv",
                   "ekspor", "export", "csv"}

LAPOR_COMMANDS = {"lapor", "kirim laporan", "laporan", "send report", "new report menu"}


def _send_buttons(sender: str, body: str, buttons: list) -> None:
    """Kirim tombol lintas transport (chunk max 3 untuk WhatsApp).

    Telegram: 1 pesan berisi semua tombol (stack vertikal otomatis).
    WhatsApp Meta/Wavio: max 3 tombol/pesan -> pecah jadi beberapa pesan.
    Twilio/Fonnte: fallback teks biasa (tombol hilang, body + perintah ketik
    tetap memandu user).
    """
    trans = transport_module()
    if trans == telegram or len(buttons) <= 3:
        trans.send_quick_reply(sender, body, buttons)
        return
    chunks = [buttons[i:i + 3] for i in range(0, len(buttons), 3)]
    for ci, chunk in enumerate(chunks):
        chunk_body = body if ci == 0 else f"(lanjut {ci + 1}/{len(chunks)})"
        try:
            trans.send_quick_reply(sender, chunk_body, chunk)
        except Exception as e:
            print(f"[menu] buttons failed, text only: {e}")
            trans.send_text(sender, chunk_body)


def _send_main_menu(sender: str, lang: str) -> None:
    _send_buttons(sender, t(lang, "menu_body"), main_menu_buttons(lang))


def _send_settings_menu(sender: str, lang: str) -> None:
    _send_buttons(sender, t(lang, "settings_body"), settings_menu_buttons(lang))


def _send_help(sender: str, lang: str) -> None:
    transport_module().send_text(sender, t(lang, "help_text"))


def _handle_export(sender: str, profile: dict) -> None:
    """Slice 12: kirim semua notes.json sebagai file CSV.

    Telegram: file dokumen (.csv) + caption jumlah catatan.
    WhatsApp (semua backend): tidak ada API dokumen di POC ini — kirim isi
    CSV sebagai teks (dipotong per ~3000 karakter agar lolos limit).
    Kosong: pesan export_empty, tidak ada file.
    """
    import export_csv

    lang = profile.get("language", "id")
    trans = transport_module()
    notes = store.load_notes()
    if not notes:
        trans.send_text(sender, t(lang, "export_empty"))
        _send_main_menu(sender, lang)
        return
    caption = t(lang, "export_caption").format(n=len(notes))
    if trans == telegram:
        telegram.send_document(
            sender,
            export_csv.notes_to_csv_bytes(notes),
            export_csv.CSV_FILENAME,
            caption,
        )
        _send_main_menu(sender, lang)
        return
    # WhatsApp fallback: CSV sebagai teks (chunk agar tidak kepotong API).
    text = export_csv.notes_to_csv_text(notes)
    chunks = [text[i:i + 3000] for i in range(0, len(text), 3000)] or [text]
    trans.send_text(sender, caption)
    for ch in chunks:
        trans.send_text(sender, ch)
    _send_main_menu(sender, lang)


def _send_lapor_prompt(sender: str, lang: str, has_draft: bool = False) -> None:
    transport_module().send_text(sender, t(lang, "lapor_prompt"))
    if has_draft:
        transport_module().send_text(sender, t(lang, "lapor_has_draft"))

TIME_RE = re.compile(r"(\d{1,2})[:.](\d{2})")


def _parse_time(text: str) -> str | None:
    m = TIME_RE.search(text or "")
    if not m:
        return None
    hh, mm = int(m.group(1)), int(m.group(2))
    if 0 <= hh <= 23 and 0 <= mm <= 59:
        return f"{hh:02d}:{mm:02d}"
    return None


def _is_skip(text: str) -> bool:
    return (text or "").strip().lower() in SKIP_WORDS


def _greeting_for(profile: dict, notes: list) -> str:
    lang = profile.get("language", "id")
    nickname = (profile.get("nickname") or "").strip()
    name = f" {nickname}" if nickname else ""
    n = len(notes)
    if lang == "en":
        base = f"Hello{name}! Sales assistant is online."
        tail = f" {n} note(s) stored." if n else " No notes yet — send a visit report."
        return base + tail + ' Send "ping" to test, or send a report text.'
    base = f"Halo{name}! Asisten sales online."
    tail = f" Tersimpan {n} catatan." if n else " Belum ada catatan — kirim laporan kunjungan."
    return base + tail + ' Kirim "ping" untuk tes, atau kirim teks laporan.'


@app.get("/")
def index():
    return jsonify({"ok": True, "service": "sales-wa-assistant"})


@app.get("/webhook")
def verify():
    mode = request.args.get("hub.mode")
    token = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge", "")
    expected = os.getenv("VERIFY_TOKEN", "")
    if mode == "subscribe" and token == expected:
        return challenge, 200
    return "forbidden", 403


def _is_allowed(sender: str, profile: dict) -> bool:
    allow = profile.get("sender_allowlist") or []
    return not allow or sender in allow


def _refuse_message(profile: dict) -> str:
    if profile.get("language") == "en":
        return "Sorry, this trial number only serves the registered sales number."
    return "Maaf, nomor uji ini hanya melayani nomor sales yang terdaftar."


@app.post("/webhook")
def incoming():
    payload = request.get_json(force=True, silent=True) or {}
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for msg in value.get("messages", []):
                try:
                    _handle_message(msg)
                except Exception as e:
                    # Never 500 on outbound failure (bad key, expired token,
                    # flaky network) — log it, keep the webhook alive.
                    print(f"[webhook] handler error: {e}")
    return jsonify({"ok": True})


@app.post("/twilio/inbound")
def twilio_inbound():
    """Slice 7: Twilio posts form-encoded (From/Body/MediaUrl0), not JSON.

    Returns empty TwiML — replies go out through the Twilio Messages API
    (same send path as Meta), so nothing is ever answered twice.
    """
    form = request.form
    sender = whatsapp._digits(form.get("From", ""))
    if not sender:
        return "<Response/>", 200, {"Content-Type": "text/xml"}
    n_media = 0
    try:
        n_media = int(form.get("NumMedia", "0") or 0)
    except ValueError:
        n_media = 0
    media_url = form.get("MediaUrl0", "") if n_media > 0 else ""
    media_type = form.get("MediaContentType0", "")
    if media_url and media_type.startswith("audio"):
        msg = {"from": sender, "type": "audio", "audio": {"url": media_url}}
    else:
        msg = {"from": sender, "type": "text",
               "text": {"body": (form.get("Body") or "").strip()}}
    try:
        _handle_message(msg)
    except Exception as e:
        print(f"[twilio] handler error: {e}")
    return "<Response/>", 200, {"Content-Type": "text/xml"}


@app.post("/wavio/inbound")
def wavio_inbound():
    """Slice 10: Wavio posts `messages:received` webhooks as JSON.

    The exact payload shape is not in the public docs, so several shapes
    are accepted: a Meta-style entry/changes forward (official-partner
    forward), or a custom envelope ({event, data} / {type, message}).
    Unknown shapes are logged and acked 200 — never 500 (Wavio retries
    failed deliveries).
    """
    payload = request.get_json(force=True, silent=True) or {}
    msgs = _parse_wavio_payload(payload)
    if not msgs and payload:
        try:
            print(f"[wavio] unrecognized payload keys: {sorted(payload.keys())}")
        except Exception:
            print("[wavio] unrecognized payload (non-dict)")
    for msg in msgs:
        try:
            _handle_message(msg)
        except Exception as e:
            print(f"[wavio] handler error: {e}")
    return jsonify({"ok": True})


def _normalize_meta_message(m: dict) -> dict | None:
    """Meta-style webhook message -> internal shape (digits sender)."""
    sender = whatsapp._digits(str(m.get("from", "")))
    if not sender:
        return None
    m = dict(m)
    m["from"] = sender
    return m


def _normalize_wavio_message(item: dict) -> dict | None:
    """One custom-envelope Wavio item -> internal {from, type, ...}."""
    if not isinstance(item, dict):
        return None
    sender = ""
    for k in ("from", "sender", "waId", "wa_id", "phone", "fromNumber", "chatId"):
        v = item.get(k)
        if v:
            sender = whatsapp._digits(str(v))
            if sender:
                break
    if not sender:
        return None
    audio = item.get("audio") or {}
    media_id = audio.get("id") or item.get("mediaId") or item.get("media_id") or ""
    media_url = (audio.get("url") or item.get("mediaUrl")
                 or item.get("media_url") or item.get("url") or "")
    msg_type = str(item.get("type") or "").lower()
    if media_id or media_url or msg_type in ("audio", "voice", "ptt", "voice_note"):
        if media_url and not media_id:
            return {"from": sender, "type": "audio", "audio": {"url": media_url}}
        if media_id:
            return {"from": sender, "type": "audio", "audio": {"id": media_id}}
        return None
    text = ""
    for k in ("text", "body", "message", "caption", "content"):
        v = item.get(k)
        if isinstance(v, dict):
            v = v.get("body") or v.get("text") or ""
        if v:
            text = str(v).strip()
            if text:
                break
    btn = item.get("buttonReply") or item.get("button_reply") or {}
    if not text and isinstance(btn, dict):
        text = str(btn.get("id") or btn.get("title") or "").strip()
    if not text:
        return None
    return {"from": sender, "type": "text", "text": {"body": text}}


def _parse_wavio_payload(payload: dict) -> list:
    """Normalize any known Wavio inbound shape to internal messages."""
    out = []
    if not isinstance(payload, dict):
        return out
    if "entry" in payload:
        for entry in payload.get("entry", []) or []:
            for change in entry.get("changes", []) or []:
                value = change.get("value", {}) or {}
                for m in value.get("messages", []) or []:
                    norm = _normalize_meta_message(m)
                    if norm:
                        out.append(norm)
        return out
    data = payload.get("data", payload)
    items = data if isinstance(data, list) else ([data] if isinstance(data, dict) else [])
    for item in items:
        norm = _normalize_wavio_message(item)
        if norm:
            out.append(norm)
    return out


@app.post("/fonnte/inbound")
def fonnte_inbound():
    """Slice 9: Fonnte posts JSON (sender/message/text/url), not Meta shape.

    Fields (docs.fonnte.com/webhook-reply-message): device, sender,
    message, text (button text), member (group sender), name, location,
    url/filename/extension (attachment), timestamp, inboxid.
    Fonnte requires HTTP 200 — always return ok, never 500.
    """
    payload = request.get_json(force=True, silent=True) or {}
    if not payload:
        try:
            payload = dict(request.form)
        except Exception:
            payload = {}
    sender = whatsapp._digits(str(payload.get("sender", "")))
    if not sender:
        return jsonify({"ok": True})
    message = str(payload.get("message", "") or "").strip()
    btn_text = str(payload.get("text", "") or "").strip()
    url = str(payload.get("url", "") or "").strip()
    ext = str(payload.get("extension", "") or "").strip().lower().lstrip(".")
    audio_exts = {"ogg", "opus", "oga", "mp3", "m4a", "aac", "wav", "amr"}
    if url and (ext in audio_exts or (not message and not btn_text)):
        msg = {"from": sender, "type": "audio", "audio": {"url": url}}
    else:
        body = message or btn_text
        msg = {"from": sender, "type": "text", "text": {"body": body}}
    try:
        _handle_message(msg)
    except Exception as e:
        print(f"[fonnte] handler error: {e}")
    return jsonify({"ok": True})


def _handle_message(msg: dict) -> None:
    sender = msg.get("from", "")
    if not sender:
        return
    profile = store.load_profile()
    trans = transport_module()
    if not _is_allowed(sender, profile):
        trans.send_text(sender, _refuse_message(profile))
        return

    # Track the 24h free-message window + flush queued failure notices.
    import datetime as _dt_seen

    profile["last_sender"] = sender
    seen = profile.get("last_seen") or {}
    seen[sender] = _dt_seen.datetime.now().isoformat(timespec="seconds")
    profile["last_seen"] = seen
    store.save_profile(profile)
    scheduler.flush_notices(sender, profile)
    profile = store.load_profile()

    msg_type = msg.get("type", "")
    text = ""
    if msg_type == "text":
        text = (msg.get("text", {}).get("body", "") or "").strip()
    elif msg_type == "interactive":
        reply = (msg.get("interactive", {}).get("button_reply") or {})
        text = (reply.get("id") or reply.get("title") or "").strip()

    low = text.lower()

    # Ping always works (tunnel proof), even mid-onboarding.
    if low == "ping":
        trans.send_text(sender, "pong")
        return

    # Slice 4: voice note -> download -> transcribe -> same pipeline.
    if msg_type == "audio":
        _handle_voice_note(sender, msg, profile)
        return

    if profile.get("onboarding_stage", "new") != "done":
        _handle_onboarding(sender, text, profile)
        return

    # Two-step button settings (tap Pengaturan -> tap opsi -> jawab).
    if _handle_pending_setting(sender, text, profile):
        return

    if _handle_menu_action(sender, text, profile):
        return

    if _handle_settings_command(sender, text, profile):
        # After a typed settings command, offer the menu for follow-up.
        profile = store.load_profile()
        _send_main_menu(sender, profile.get("language", "id"))
        return

    if low in GREETINGS:
        trans.send_text(sender, _greeting_for(profile, store.load_notes()))
        _send_main_menu(sender, profile.get("language", "id"))
        return

    # Slice 6: demo commands call the same functions as the scheduler.
    # English aliases included — an unrecognized "recap now" must never
    # become a bogus empty report (see _handle_report empty-guard).
    if low in ("rekap sekarang", "rekap", "recap", "recap now",
               "send recap", "send me the recap", "recap please",
               "minta rekap"):
        scheduler.send_recap_to(profile, sender)
        return
    if low in ("cek follow-up", "cek follow up", "cek followup",
               "check follow-up", "check follow-ups", "follow-up",
               "follow up", "follow-ups", "followups", "cek pengingat"):
        scheduler.send_followups_to(profile, sender)
        return

    # Slice 12: ekspor CSV (perintah ketik, semua bahasa).
    if low in EXPORT_COMMANDS:
        _handle_export(sender, profile)
        return

    # A tap on a recap detail button always means "show that note",
    # even mid-clarification (the draft stays active afterwards).
    if low.startswith("view_"):
        _handle_view_note(sender, profile, text.strip()[5:])
        return

    # An answer to pending clarification wins over a new report. To start
    # a fresh report instead, prefix with "laporan baru".
    if low.startswith("laporan baru") or low.startswith("new report"):
        _finalize_draft(store.load_notes())
        _handle_report(sender, text.split(None, 2)[-1], profile)
        return

    active = _active_draft(store.load_notes())
    if active is not None:
        _handle_clarify_answer(sender, text, profile, active)
        return

    # A typed number (or "lihat N"/"view N") picks a recap detail entry.
    pick = profile.get("recap_picklist") or []
    num = None
    if low.isdigit():
        num = int(low)
    else:
        m = re.match(r"^(?:lihat|view|buka|open)\s+(\d+)$", low)
        if m:
            num = int(m.group(1))
    if num is not None and pick and 1 <= num <= len(pick):
        _handle_view_note(sender, profile, pick[num - 1])
        profile = store.load_profile()
        profile["recap_picklist"] = []
        store.save_profile(profile)
        return

    _handle_report(sender, text, profile)


# --- Button menu actions (post-onboarding) ---


def _handle_menu_action(sender: str, text: str, profile: dict) -> bool:
    """Route menu button taps + typed menu/help/settings shortcuts.

    Returns True if handled. Works for Telegram inline buttons and
    WhatsApp interactive replies (both arrive as button id via text).
    On plain-text fallbacks (Twilio/Fonnte) the same actions are reachable
    by typing: menu / bantuan / pengaturan / rekap / cek follow-up.
    """
    lang = profile.get("language", "id")
    low = (text or "").strip().lower()
    trans = transport_module()

    # Main menu show.
    if text in ("menu_main",) or low in MENU_COMMANDS:
        _send_main_menu(sender, lang)
        return True

    # Help.
    if text in ("menu_help",) or low in HELP_COMMANDS:
        _send_help(sender, lang)
        _send_main_menu(sender, lang)
        return True

    # Settings submenu.
    if text in ("menu_settings",) or low in SETTINGS_MENU_COMMANDS:
        profile["pending_setting"] = ""
        store.save_profile(profile)
        _send_settings_menu(sender, lang)
        return True

    # Lapor: prompt for a report; keep active draft (don't lose progress).
    if text in ("menu_lapor",) or low in LAPOR_COMMANDS:
        active = _active_draft(store.load_notes())
        _send_lapor_prompt(sender, lang, has_draft=active is not None)
        if active is not None:
            _ask_field(sender, lang, active["pending_clarify"][0])
        return True

    # Recap / follow-up via button (same functions as scheduler/demo).
    if text in ("menu_recap",):
        scheduler.send_recap_to(profile, sender)
        return True
    if text in ("menu_followup",):
        scheduler.send_followups_to(profile, sender)
        return True
    if text in ("menu_export",) or low in EXPORT_COMMANDS:
        _handle_export(sender, profile)
        return True

    # Settings options (two-step).
    if text in ("settings_name",):
        profile["pending_setting"] = "nickname"
        store.save_profile(profile)
        trans.send_text(sender, t(lang, "setting_name_ask"))
        return True
    if text in ("settings_lang",):
        profile["pending_setting"] = "language"
        store.save_profile(profile)
        trans.send_quick_reply(sender, t(lang, "onboarding_lang"), LANG_BUTTONS)
        return True
    if text in ("settings_time",):
        profile["pending_setting"] = "recap_time"
        store.save_profile(profile)
        _send_buttons(sender, t(lang, "setting_time_ask"), time_preset_buttons())
        return True

    # Language choice (settings flow or general tap).
    if text in ("lang_id", "lang_en"):
        profile["language"] = "en" if text == "lang_en" else "id"
        profile["pending_setting"] = ""
        store.save_profile(profile)
        trans.send_text(sender, t(profile["language"], "lang_updated"))
        _send_main_menu(sender, profile["language"])
        return True

    # Time preset (settings flow or general tap outside onboarding).
    if text.startswith("time_"):
        parsed = _parse_time(text[5:])
        if parsed:
            profile["recap_time"] = parsed
            profile["pending_setting"] = ""
            store.save_profile(profile)
            trans.send_text(
                sender, t(profile.get("language", "id"), "time_updated").format(time=parsed)
            )
            _send_main_menu(sender, profile.get("language", "id"))
        else:
            trans.send_text(sender, t(lang, "time_invalid"))
        return True

    return False


def _handle_pending_setting(sender: str, text: str, profile: dict) -> bool:
    """Consume the answer to a two-step button setting (name/time/language).

    Menu/help button taps always escape the pending state.
    Returns True if the message was consumed here.
    """
    pending = (profile.get("pending_setting") or "").strip()
    if not pending:
        return False
    lang = profile.get("language", "id")
    low = (text or "").strip().lower()
    trans = transport_module()

    # Escape hatch: menu navigation cancels the pending setting.
    if text.startswith("menu_") or text in ("settings_name", "settings_lang",
                                            "settings_time") or low in (
            MENU_COMMANDS | HELP_COMMANDS | SETTINGS_MENU_COMMANDS):
        profile["pending_setting"] = ""
        store.save_profile(profile)
        return _handle_menu_action(sender, text, profile)

    # Operational commands/reports bypass a stale pending setting instead
    # of being swallowed as a name/time answer (e.g. user taps an old
    # settings button then sends a real report).
    if (low == "ping" or low in GREETINGS or low.startswith("view_")
            or low.startswith("laporan baru") or low.startswith("new report")
            or low in EXPORT_COMMANDS
            or low in ("rekap sekarang", "rekap", "recap", "recap now",
                       "send recap", "send me the recap", "recap please",
                       "minta rekap", "cek follow-up", "cek follow up",
                       "cek followup", "check follow-up", "check follow-ups",
                       "follow-up", "follow up", "follow-ups", "followups",
                       "cek pengingat")):
        profile["pending_setting"] = ""
        store.save_profile(profile)
        return False

    # Language pending is answered via lang_* buttons (handled in menu action).
    if pending == "language":
        if text in ("lang_id", "lang_en"):
            return _handle_menu_action(sender, text, profile)
        if _is_skip(text) or not (text or "").strip():
            profile["language"] = "id"
            profile["pending_setting"] = ""
            store.save_profile(profile)
            trans.send_text(sender, t("id", "lang_updated"))
            _send_main_menu(sender, "id")
            return True
        # Typed language name.
        if low in ("english", "inggris", "en", "2"):
            return _handle_menu_action(sender, "lang_en", profile)
        if low in ("indonesia", "bahasa indonesia", "id", "1"):
            return _handle_menu_action(sender, "lang_id", profile)
        trans.send_quick_reply(sender, t(lang, "onboarding_lang"), LANG_BUTTONS)
        return True

    if pending == "nickname":
        if not (text or "").strip():
            trans.send_text(sender, t(lang, "setting_name_ask"))
            return True
        profile["nickname"] = text.strip()[:30]
        profile["pending_setting"] = ""
        store.save_profile(profile)
        trans.send_text(
            sender, t(profile.get("language", "id"), "name_updated").format(name=profile["nickname"])
        )
        _send_main_menu(sender, profile.get("language", "id"))
        return True

    if pending == "recap_time":
        if _is_skip(text) or not (text or "").strip():
            parsed = "17:00"
        else:
            parsed = _parse_time(text[len("time_"):] if text.startswith("time_") else text)
        if not parsed:
            _send_buttons(sender, t(lang, "setting_time_ask"), time_preset_buttons())
            return True
        profile["recap_time"] = parsed
        profile["pending_setting"] = ""
        store.save_profile(profile)
        trans.send_text(
            sender, t(profile.get("language", "id"), "time_updated").format(time=parsed)
        )
        _send_main_menu(sender, profile.get("language", "id"))
        return True

    profile["pending_setting"] = ""
    store.save_profile(profile)
    return False


def _handle_voice_note(sender: str, msg: dict, profile: dict) -> None:
    """Slice 4: audio.id -> immediate download -> Whisper -> _handle_report."""
    from transcribe import transcribe_audio

    lang = profile.get("language", "id")
    trans = transport_module()
    media = (msg.get("audio") or {})
    try:
        if trans == telegram or media.get("telegram"):
            audio_bytes = telegram.download_voice(media.get("id", ""))
        elif whatsapp.backend() == "d360" and not whatsapp.is_stub():
            trans.send_text(sender, t(lang, "vn_no_media"))
            return
        elif media.get("url"):
            if whatsapp.backend() == "fonnte":
                audio_bytes = whatsapp.download_fonnte_media(media["url"])
            elif whatsapp.backend() == "wavio":
                audio_bytes = whatsapp.download_wavio_url(media["url"])
            else:
                audio_bytes = whatsapp.download_twilio_media(media["url"])
        elif media.get("id"):
            if whatsapp.backend() == "wavio":
                audio_bytes = whatsapp.download_wavio_media(media["id"])
            else:
                audio_bytes = whatsapp.download_media(media["id"])
        else:
            raise ValueError("no audio ref")
    except Exception as e:
        print(f"[voice_note] download fail: {e}")
        trans.send_text(sender, t(lang, "vn_download_fail"))
        return

    # Groq rejects the ".oga" extension (only whitelists ".ogg" among ogg
    # types) even though the bytes are identical Ogg Opus — always send .ogg.
    result = transcribe_audio(audio_bytes, filename="voice.ogg")
    if result.get("status") != "ok" or not result.get("text"):
        trans.send_text(sender, t(lang, "vn_unclear"))
        return
    _handle_report(sender, result["text"], profile)


def _handle_view_note(sender: str, profile: dict, note_id: str) -> None:
    """Resend the full card for one recap entry (button tap or number)."""
    lang = profile.get("language", "id")
    note = scheduler.find_note(note_id)
    trans = transport_module()
    if note is None:
        trans.send_text(sender, scheduler.NOTE_GONE.get(lang, scheduler.NOTE_GONE["id"]))
        _send_main_menu(sender, lang)
        return
    trans.send_text(sender, render_card(note, lang))
    _send_main_menu(sender, lang)


def _handle_report(sender: str, text: str, profile: dict) -> None:
    """Slice 3: free text -> Groq extraction -> card + draft note."""
    import datetime as _dt

    lang = profile.get("language", "id")
    trans = transport_module()
    try:
        fields = extract_report(text)
    except GroqError:
        trans.send_text(sender, t(lang, "ai_busy"))
        return

    if not any((fields.get(f) or "").strip() for f in FIELD_ORDER):
        # Nothing extractable (e.g. a mistyped command) — don't pollute
        # notes.json with an empty note + 5 pointless questions.
        trans.send_text(sender, t(lang, "report_empty"))
        _send_main_menu(sender, lang)
        return

    notes = store.load_notes()
    note = {
        "id": new_note_id(notes),
        "created_at": _dt.datetime.now().isoformat(timespec="seconds"),
        "institusi": fields.get("institusi", ""),
        "kontak": fields.get("kontak", ""),
        "role": fields.get("role", ""),
        "produk": fields.get("produk", ""),
        "tahap_deal": fields.get("tahap_deal", ""),
        "followup_date": fields.get("followup_date", ""),
        "status": "saved" if not missing_fields(fields) else "draft",
        "pending_clarify": missing_fields(fields),
    }
    notes.append(note)
    store.save_notes(notes)
    trans.send_text(sender, render_card(note, lang))
    if note["pending_clarify"]:
        _ask_field(sender, lang, note["pending_clarify"][0])
    else:
        _send_main_menu(sender, lang)


def _active_draft(notes: list) -> dict | None:
    """Newest note still waiting for clarification answers."""
    for note in reversed(notes):
        if note.get("status") == "draft" and note.get("pending_clarify"):
            return note
    return None


def _finalize_draft(notes: list) -> None:
    changed = False
    for note in notes:
        if note.get("status") == "draft":
            note["status"] = "saved"
            note["pending_clarify"] = []
            changed = True
    if changed:
        store.save_notes(notes)


def _ask_field(sender: str, lang: str, field: str) -> None:
    if field == "tahap_deal":
        _send_buttons(sender, clarify_question(lang, field), tahap_deal_buttons(lang))
        return
    transport_module().send_quick_reply(sender, clarify_question(lang, field), SKIP_BUTTON)


def _handle_clarify_answer(sender: str, text: str, profile: dict, active: dict) -> None:
    """Slice 5: one answer (or Skip) -> update note -> next question or done."""
    lang = profile.get("language", "id")
    notes = store.load_notes()
    note = next((n for n in notes if n.get("id") == active.get("id")), None)
    if note is None or not note.get("pending_clarify"):
        _handle_report(sender, text, profile)
        return

    field = note["pending_clarify"][0]
    # Tahap-deal preset buttons map id -> canonical Indonesian stage.
    answer = DEAL_ID_MAP.get(text, text) if field == "tahap_deal" else text
    if not _is_skip(text) and (answer or "").strip():
        note[field] = answer.strip()[:80]
    note["pending_clarify"] = note["pending_clarify"][1:]
    if not note["pending_clarify"]:
        note["status"] = "saved"
    store.save_notes(notes)

    if note["pending_clarify"]:
        _ask_field(sender, lang, note["pending_clarify"][0])
        return
    filled = sum(1 for f in FIELD_ORDER if (note.get(f) or "").strip())
    transport_module().send_text(
        sender, clarify_question(lang, "saved").format(filled=filled)
    )
    _send_main_menu(sender, lang)


# --- Onboarding (PRD 0): name -> language -> recap time, each skippable ---


def _handle_onboarding(sender: str, text: str, profile: dict) -> None:
    lang = profile.get("language", "id")
    stage = profile.get("onboarding_stage", "new")
    trans = transport_module()

    # Button-based navigation stays available mid-onboarding: menu/help
    # taps show the menu without losing the current onboarding stage.
    low_onb = (text or "").strip().lower()
    if text in ("menu_main", "menu_help", "menu_settings", "menu_lapor",
                "menu_recap", "menu_followup") or low_onb in (
            MENU_COMMANDS | HELP_COMMANDS | SETTINGS_MENU_COMMANDS):
        if text in ("menu_help",) or low_onb in HELP_COMMANDS:
            _send_help(sender, lang)
        else:
            _send_main_menu(sender, lang)
        # Re-send the current stage prompt so onboarding doesn't stall.
        if stage == "new" or stage == "ask_name":
            trans.send_quick_reply(sender, t(lang, "onboarding_name"), SKIP_BUTTON)
            if stage == "new":
                profile["onboarding_stage"] = "ask_name"
                store.save_profile(profile)
        elif stage == "ask_language":
            trans.send_quick_reply(sender, t(lang, "onboarding_lang"), LANG_BUTTONS)
        elif stage == "ask_time":
            _send_buttons(sender, t(profile.get("language", "id"), "onboarding_time"),
                          time_preset_buttons())
        return

    if stage == "new":
        profile["onboarding_stage"] = "ask_name"
        store.save_profile(profile)
        trans.send_quick_reply(sender, t(lang, "onboarding_name"), SKIP_BUTTON)
        return

    if stage == "ask_name":
        # Unexpected navigation/stage buttons are not valid names — re-ask.
        if text.startswith(("time_", "deal_", "view_", "lang_",
                            "settings_", "menu_")):
            trans.send_quick_reply(sender, t(lang, "onboarding_name"), SKIP_BUTTON)
            return
        if not _is_skip(text) and text:
            profile["nickname"] = text.strip()[:30]
        profile["onboarding_stage"] = "ask_language"
        store.save_profile(profile)
        trans.send_quick_reply(sender, t(lang, "onboarding_lang"), LANG_BUTTONS)
        return

    if stage == "ask_language":
        low = (text or "").strip().lower()
        if low in ("lang_en", "english", "inggris", "en", "2"):
            profile["language"] = "en"
        elif _is_skip(text) or low in ("", "lang_id"):
            profile["language"] = "id"
        elif low in ("indonesia", "bahasa indonesia", "id", "1"):
            profile["language"] = "id"
        else:
            # Unrecognized: keep asking once, don't advance.
            trans.send_quick_reply(
                sender, t(profile.get("language", "id"), "onboarding_lang"), LANG_BUTTONS
            )
            return
        profile["onboarding_stage"] = "ask_time"
        store.save_profile(profile)
        _send_buttons(sender, t(profile["language"], "onboarding_time"),
                      time_preset_buttons())
        return

    if stage == "ask_time":
        raw = text[5:] if text.startswith("time_") else text
        if _is_skip(text) or not (text or "").strip():
            profile["recap_time"] = "17:00"
        else:
            parsed = _parse_time(raw)
            if not parsed:
                _send_buttons(sender, t(profile.get("language", "id"),
                                        "onboarding_time_invalid"),
                              time_preset_buttons())
                return
            profile["recap_time"] = parsed
        profile["onboarding_stage"] = "done"
        profile["pending_setting"] = ""
        store.save_profile(profile)
        name = profile.get("nickname") or ("kamu" if profile["language"] == "id" else "there")
        trans.send_text(
            sender,
            t(profile["language"], "onboarding_done").format(
                name=name,
                lang_label=t(profile["language"], "lang_label"),
                time=profile["recap_time"],
            ),
        )
        _send_main_menu(sender, profile["language"])
        return

    # Unknown stage: reset safely.
    profile["onboarding_stage"] = "new"
    store.save_profile(profile)
    _handle_onboarding(sender, text, profile)


# --- Settings commands after onboarding ---


def _handle_settings_command(sender: str, text: str, profile: dict) -> bool:
    lang = profile.get("language", "id")
    low = (text or "").strip().lower()
    trans = transport_module()

    m = re.match(r"(?:ubah|ganti)\s+nama(?:\s+ke|\s+jadi)?\s+(.+)", text, re.IGNORECASE)
    if not m:
        m = re.match(r"(?:change\s+name\s+to|my\s+name\s+is)\s+(.+)", text, re.IGNORECASE)
    if m:
        profile["nickname"] = m.group(1).strip().strip('"').strip()[:30]
        profile["pending_setting"] = ""
        store.save_profile(profile)
        trans.send_text(
            sender, t(profile.get("language", "id"), "name_updated").format(name=profile["nickname"])
        )
        return True

    if any(k in low for k in ("ganti ke bahasa", "ganti bahasa ke", "switch to", "change language to")):
        if "inggris" in low or "english" in low:
            profile["language"] = "en"
            profile["pending_setting"] = ""
            store.save_profile(profile)
            trans.send_text(sender, t("en", "lang_updated"))
            return True
        if "indonesia" in low or "indonesian" in low:
            profile["language"] = "id"
            profile["pending_setting"] = ""
            store.save_profile(profile)
            trans.send_text(sender, t("id", "lang_updated"))
            return True

    if any(k in low for k in ("ubah jam rekap", "ganti jam rekap", "change recap time", "recap time")):
        parsed = _parse_time(text)
        if parsed:
            profile["recap_time"] = parsed
            profile["pending_setting"] = ""
            store.save_profile(profile)
            trans.send_text(
                sender, t(profile.get("language", "id"), "time_updated").format(time=parsed)
            )
        else:
            trans.send_text(sender, t(lang, "time_invalid"))
        return True

    return False


@app.post("/telegram/webhook")
def telegram_webhook():
    payload = request.get_json(force=True, silent=True) or {}
    _process_telegram_update(payload)
    return jsonify({"ok": True})


def _process_telegram_update(update: dict) -> None:
    if not isinstance(update, dict):
        return

    # Dedup lintas proses: kalau dua polling (atau polling + webhook)
    # menerima update_id yang sama, hanya satu yang membalas. Tanpa ini,
    # VN dibalas dua kali (satu gagal + satu kartu) + HTTP 409 terus.
    uid = update.get("update_id")
    if uid is not None and not store.claim_update(uid):
        print(f"[telegram] duplicate update {uid} skipped")
        return

    if "callback_query" in update:
        cb = update["callback_query"]
        cb_id = str(cb.get("id", ""))
        data = str(cb.get("data", "")).strip()
        msg = cb.get("message") or {}
        chat = msg.get("chat") or {}
        sender = str(chat.get("id") or cb.get("from", {}).get("id") or "")

        if cb_id:
            telegram.answer_callback_query(cb_id)

        if sender and data:
            _handle_message({
                "from": sender,
                "type": "interactive",
                "interactive": {"button_reply": {"id": data, "title": data}},
                "telegram": True,
            })
        return

    msg = update.get("message")
    if not isinstance(msg, dict):
        return

    chat = msg.get("chat") or {}
    sender = str(chat.get("id") or msg.get("from", {}).get("id") or "")
    if not sender:
        return

    voice = msg.get("voice") or msg.get("audio")
    if voice and isinstance(voice, dict) and voice.get("file_id"):
        _handle_message({
            "from": sender,
            "type": "audio",
            "audio": {"id": voice["file_id"], "telegram": True},
            "telegram": True,
        })
        return

    text = (msg.get("text") or "").strip()
    if text:
        _handle_message({
            "from": sender,
            "type": "text",
            "text": {"body": text},
            "telegram": True,
        })
        return


if __name__ == "__main__":
    scheduler.start()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")))
