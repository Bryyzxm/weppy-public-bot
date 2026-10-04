"""Simulated WhatsApp chat for review without a live Meta connection.

The Meta test account is blocked from messaging +62 numbers (error 130497:
business verification + payment method required), so this drives the full
core journey through the Flask test client with stubbed Groq/WhatsApp and
prints the conversation WA-style.

Usage: ./.venv/bin/python demo_chat.py
"""

import os

os.environ["WHATSAPP_STUB"] = "1"
os.environ["WHATSAPP_QUIET"] = "1"
os.environ["GROQ_STUB"] = "1"
os.environ["TRANSCRIBE_TEXT"] = ""

import store
import whatsapp
from app import app

YOU = "Kamu "
AGENT = "Agent"


def say(who, text):
    print(f"\n{who}: {text}")


def main():
    store.ensure_data()
    store.save_profile(dict(store.DEFAULT_PROFILE))
    store.save_notes([])

    c = app.test_client()

    def send_text(body, sender="628520000001"):
        msg = {"from": sender, "type": "text", "text": {"body": body}}
        c.post("/webhook", json={"entry": [{"changes": [{"value": {"messages": [msg]}}]}]})
        new = whatsapp.OUTBOX[:]
        whatsapp.clear_outbox()
        return new

    def send_audio(media_id="demo-vn-1", sender="628520000001"):
        msg = {"from": sender, "type": "audio", "audio": {"id": media_id}}
        c.post("/webhook", json={"entry": [{"changes": [{"value": {"messages": [msg]}}]}]})
        new = whatsapp.OUTBOX[:]
        whatsapp.clear_outbox()
        return new

    def show(outbox):
        for m in outbox:
            body = m.get("body", "")
            btns = ""
            if m.get("type") == "quick_reply":
                btns = "  [tombol: " + ", ".join(b["title"] for b in m["buttons"]) + "]"
            say(AGENT, body + btns)

    print("=" * 60)
    print("SIMULASI CHAT WHATSAPP — Asisten Sales B2B")
    print("=" * 60)

    say(YOU, "halo")
    show(send_text("halo"))
    say(YOU, "Budi")
    show(send_text("Budi"))
    say(YOU, "Indonesia")
    show(send_text("Indonesia"))
    say(YOU, "17:00")
    show(send_text("17:00"))

    say(YOU, "Baru dari PT Sinar Abadi bahas kopi 50kg, minta penawaran harga")
    show(send_text("Baru dari PT Sinar Abadi bahas kopi 50kg, minta penawaran harga"))
    say(YOU, "Ibu Sari")
    show(send_text("Ibu Sari"))
    say(YOU, "Skip")
    show(send_text("Skip"))

    os.environ["TRANSCRIBE_TEXT"] = (
        "Kunjungan ke CV Berkah ketemu Pak Dedi manager, bahas teh 30kg, "
        "deal, follow up besok"
    )
    say(YOU, "[voice note]")
    show(send_audio())
    os.environ["TRANSCRIBE_TEXT"] = ""

    say(YOU, "cek follow-up")
    show(send_text("cek follow-up"))
    say(YOU, "rekap sekarang")
    show(send_text("rekap sekarang"))

    print("\n" + "=" * 60)
    print("ISI data/notes.json:")
    for n in store.load_notes():
        print(f"- {n['id']} | {n.get('institusi') or '?'} | {n.get('kontak') or '?'} | "
              f"{n.get('tahap_deal') or '?'} | follow-up {n.get('followup_date')} | {n['status']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
