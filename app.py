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
import whatsapp
from agent import FIELD_ORDER, GroqError, extract_report, missing_fields, new_note_id, render_card
from prompts import SKIP_WORDS, clarify_question, t
import scheduler

app = Flask(__name__)
store.ensure_data()

GREETINGS = {"halo", "hallo", "hai", "hello", "hi", "p", "assalamualaikum", "tes", "test"}

LANG_BUTTONS = [
    {"id": "lang_id", "title": "Indonesia"},
    {"id": "lang_en", "title": "English"},
    {"id": "skip", "title": "Skip"},
]
SKIP_BUTTON = [{"id": "skip", "title": "Skip"}]

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
                _handle_message(msg)
    return jsonify({"ok": True})


def _handle_message(msg: dict) -> None:
    sender = msg.get("from", "")
    if not sender:
        return
    profile = store.load_profile()
    if not _is_allowed(sender, profile):
        whatsapp.send_text(sender, _refuse_message(profile))
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
        whatsapp.send_text(sender, "pong")
        return

    # Slice 4: voice note -> download -> transcribe -> same pipeline.
    if msg_type == "audio":
        _handle_voice_note(sender, msg, profile)
        return

    if profile.get("onboarding_stage", "new") != "done":
        _handle_onboarding(sender, text, profile)
        return

    if _handle_settings_command(sender, text, profile):
        return

    if low in GREETINGS:
        whatsapp.send_text(sender, _greeting_for(profile, store.load_notes()))
        return

    # Slice 6: demo commands call the same functions as the scheduler.
    if low in ("rekap sekarang",):
        scheduler.send_recap_to(profile, sender)
        return
    if low in ("cek follow-up", "cek follow up"):
        scheduler.send_followups_to(profile, sender)
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

    _handle_report(sender, text, profile)


def _handle_voice_note(sender: str, msg: dict, profile: dict) -> None:
    """Slice 4: audio.id -> immediate download -> Whisper -> _handle_report."""
    from transcribe import transcribe_audio

    lang = profile.get("language", "id")
    media_id = (msg.get("audio") or {}).get("id", "")
    if not media_id:
        whatsapp.send_text(sender, t(lang, "vn_download_fail"))
        return
    try:
        audio_bytes = whatsapp.download_media(media_id)
    except Exception:
        whatsapp.send_text(sender, t(lang, "vn_download_fail"))
        return

    result = transcribe_audio(audio_bytes)
    if result.get("status") != "ok" or not result.get("text"):
        whatsapp.send_text(sender, t(lang, "vn_unclear"))
        return
    _handle_report(sender, result["text"], profile)


def _handle_report(sender: str, text: str, profile: dict) -> None:
    """Slice 3: free text -> Groq extraction -> card + draft note."""
    import datetime as _dt

    lang = profile.get("language", "id")
    try:
        fields = extract_report(text)
    except GroqError:
        whatsapp.send_text(sender, t(lang, "ai_busy"))
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
    whatsapp.send_text(sender, render_card(note, lang))
    if note["pending_clarify"]:
        _ask_field(sender, lang, note["pending_clarify"][0])


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
    whatsapp.send_quick_reply(sender, clarify_question(lang, field), SKIP_BUTTON)


def _handle_clarify_answer(sender: str, text: str, profile: dict, active: dict) -> None:
    """Slice 5: one answer (or Skip) -> update note -> next question or done."""
    lang = profile.get("language", "id")
    notes = store.load_notes()
    note = next((n for n in notes if n.get("id") == active.get("id")), None)
    if note is None or not note.get("pending_clarify"):
        _handle_report(sender, text, profile)
        return

    field = note["pending_clarify"][0]
    if not _is_skip(text) and (text or "").strip():
        note[field] = text.strip()[:80]
    note["pending_clarify"] = note["pending_clarify"][1:]
    if not note["pending_clarify"]:
        note["status"] = "saved"
    store.save_notes(notes)

    if note["pending_clarify"]:
        _ask_field(sender, lang, note["pending_clarify"][0])
        return
    filled = sum(1 for f in FIELD_ORDER if (note.get(f) or "").strip())
    whatsapp.send_text(
        sender, clarify_question(lang, "saved").format(filled=filled)
    )


# --- Onboarding (PRD 0): name -> language -> recap time, each skippable ---


def _handle_onboarding(sender: str, text: str, profile: dict) -> None:
    lang = profile.get("language", "id")
    stage = profile.get("onboarding_stage", "new")

    if stage == "new":
        profile["onboarding_stage"] = "ask_name"
        store.save_profile(profile)
        whatsapp.send_text(sender, t(lang, "onboarding_name"))
        return

    if stage == "ask_name":
        if not _is_skip(text) and text:
            profile["nickname"] = text.strip()[:30]
        profile["onboarding_stage"] = "ask_language"
        store.save_profile(profile)
        whatsapp.send_quick_reply(sender, t(lang, "onboarding_lang"), LANG_BUTTONS)
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
            whatsapp.send_quick_reply(
                sender, t(profile.get("language", "id"), "onboarding_lang"), LANG_BUTTONS
            )
            return
        profile["onboarding_stage"] = "ask_time"
        store.save_profile(profile)
        whatsapp.send_text(sender, t(profile["language"], "onboarding_time"))
        return

    if stage == "ask_time":
        if _is_skip(text) or not (text or "").strip():
            profile["recap_time"] = "17:00"
        else:
            parsed = _parse_time(text)
            if not parsed:
                whatsapp.send_text(sender, t(profile.get("language", "id"),
                                            "onboarding_time_invalid"))
                return
            profile["recap_time"] = parsed
        profile["onboarding_stage"] = "done"
        store.save_profile(profile)
        name = profile.get("nickname") or ("kamu" if profile["language"] == "id" else "there")
        whatsapp.send_text(
            sender,
            t(profile["language"], "onboarding_done").format(
                name=name,
                lang_label=t(profile["language"], "lang_label"),
                time=profile["recap_time"],
            ),
        )
        return

    # Unknown stage: reset safely.
    profile["onboarding_stage"] = "new"
    store.save_profile(profile)
    _handle_onboarding(sender, text, profile)


# --- Settings commands after onboarding ---


def _handle_settings_command(sender: str, text: str, profile: dict) -> bool:
    lang = profile.get("language", "id")
    low = (text or "").strip().lower()

    m = re.match(r"(?:ubah|ganti)\s+nama(?:\s+ke|\s+jadi)?\s+(.+)", text, re.IGNORECASE)
    if not m:
        m = re.match(r"(?:change\s+name\s+to|my\s+name\s+is)\s+(.+)", text, re.IGNORECASE)
    if m:
        profile["nickname"] = m.group(1).strip().strip('"').strip()[:30]
        store.save_profile(profile)
        whatsapp.send_text(
            sender, t(profile.get("language", "id"), "name_updated").format(name=profile["nickname"])
        )
        return True

    if any(k in low for k in ("ganti ke bahasa", "ganti bahasa ke", "switch to", "change language to")):
        if "inggris" in low or "english" in low:
            profile["language"] = "en"
            store.save_profile(profile)
            whatsapp.send_text(sender, t("en", "lang_updated"))
            return True
        if "indonesia" in low or "indonesian" in low:
            profile["language"] = "id"
            store.save_profile(profile)
            whatsapp.send_text(sender, t("id", "lang_updated"))
            return True

    if any(k in low for k in ("ubah jam rekap", "ganti jam rekap", "change recap time", "recap time")):
        parsed = _parse_time(text)
        if parsed:
            profile["recap_time"] = parsed
            store.save_profile(profile)
            whatsapp.send_text(
                sender, t(profile.get("language", "id"), "time_updated").format(time=parsed)
            )
        else:
            whatsapp.send_text(sender, t(lang, "time_invalid"))
        return True

    return False


if __name__ == "__main__":
    scheduler.start()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")))
