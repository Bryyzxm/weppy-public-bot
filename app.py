"""Flask webhook + chat router (slice 1: ping proof + greeting).

Spec refs: Components (Webhook dan Chat Router), Where It Runs,
Decisions and Open Issues (ping-pong proof before AI work).
"""

import os

from dotenv import load_dotenv
from flask import Flask, jsonify, request

load_dotenv()

import store
import whatsapp

app = Flask(__name__)
store.ensure_data()

GREETINGS = {"halo", "hallo", "hai", "hello", "hi", "p", "assalamualaikum", "tes", "test"}


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

    msg_type = msg.get("type", "")
    text = ""
    if msg_type == "text":
        text = (msg.get("text", {}).get("body", "") or "").strip()
    elif msg_type == "interactive":
        reply = (msg.get("interactive", {}).get("button_reply") or {})
        text = (reply.get("id") or reply.get("title") or "").strip()

    low = text.lower()
    if low == "ping":
        whatsapp.send_text(sender, "pong")
        return
    if low in GREETINGS:
        notes = store.load_notes()
        whatsapp.send_text(sender, _greeting_for(profile, notes))
        return

    # Slice 1 fallback: extraction (slice 3) not built yet.
    if profile.get("language") == "en":
        whatsapp.send_text(
            sender,
            "Message received. Text-report extraction isn't active yet "
            "(slice 3). Send \"ping\" to test the connection.",
        )
    else:
        whatsapp.send_text(
            sender,
            "Pesan diterima. Ekstraksi laporan teks belum aktif "
            "(slice 3). Kirim \"ping\" untuk tes koneksi.",
        )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")))
