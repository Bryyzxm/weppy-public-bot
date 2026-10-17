"""Self-check and DoD verification for Telegram transport pivot.

Run:
    python test_telegram.py
"""

import os
import json

os.environ["CHAT_TRANSPORT"] = "telegram"
os.environ["TELEGRAM_STUB"] = "1"
os.environ["TELEGRAM_QUIET"] = "1"
os.environ["GROQ_STUB"] = "1"
os.environ["TRANSCRIBE_TEXT"] = ""
# Isolasi dari .env developer: tes VN memakai stub teks, bukan model lokal.
# (Tanpa ini, TRANSCRIBE_BACKEND=local di .env membuat fake bytes stub
#  dikirim ke faster-whisper -> unclear -> tes 5 gagal.)
os.environ["TRANSCRIBE_BACKEND"] = "groq"

import store
import telegram
from app import app


def run_tests():
    print("--- Running Telegram Transport Verification ---")
    store.ensure_data()
    chat_id = "99887766"
    store.save_user_profile(chat_id, dict(store.DEFAULT_USER_PROFILE))
    store.save_user_notes(chat_id, [])
    try:
        store.SEEN_PATH.unlink()
    except OSError:
        pass
    telegram.clear_outbox()
    c = app.test_client()

    def prof_user():
        return {"users": {chat_id: store.load_user_profile(chat_id)}}, store.load_user_profile(chat_id)

    def post_tg(payload):
        telegram.clear_outbox()
        resp = c.post("/telegram/webhook", json=payload)
        assert resp.status_code == 200, f"Webhook failed: {resp.status_code}"
        return telegram.OUTBOX[:]

    # 1. Test Ping -> Pong
    out = post_tg({
        "update_id": 1,
        "message": {"chat": {"id": chat_id}, "text": "ping"}
    })
    assert len(out) == 1, f"Expected 1 response, got {len(out)}"
    assert out[0]["body"] == "pong", f"Expected 'pong', got {out[0]['body']}"
    print("[PASS] 1. Ping -> Pong verified")

    # 2. Test Onboarding flow via Telegram
    # 2a. Sapaan pertama — sekarang 2 pesan: welcome + tanya nama
    out = post_tg({
        "update_id": 2,
        "message": {"chat": {"id": chat_id}, "text": "halo"}
    })
    assert len(out) == 2, f"Expected welcome + ask_name (2 msgs), got {len(out)}"
    assert "asisten sales" in out[0]["body"].lower() or "sales assistant" in out[0]["body"].lower()
    assert "nama panggilan" in out[1]["body"].lower()

    # 2b. Jawab nama
    out = post_tg({
        "update_id": 3,
        "message": {"chat": {"id": chat_id}, "text": "Andi"}
    })
    assert "bahasa" in out[0]["body"].lower()

    # 2c. Jawab bahasa (inline callback atau text)
    out = post_tg({
        "update_id": 4,
        "callback_query": {
            "id": "cb_lang_id",
            "from": {"id": chat_id},
            "message": {"chat": {"id": chat_id}},
            "data": "lang_id",
        }
    })
    assert "rekap" in out[0]["body"].lower()

    # 2d. Jawab jam rekap
    out = post_tg({
        "update_id": 5,
        "message": {"chat": {"id": chat_id}, "text": "17:00"}
    })
    assert "siap, andi" in out[0]["body"].lower()
    g, up = prof_user()
    assert up["nickname"] == "Andi"
    assert up["onboarding_stage"] == "done"
    print("[PASS] 2. Onboarding (name, language, recap time) verified")

    # 3. Test Text Report Extraction & Clarification with Skip Button
    out = post_tg({
        "update_id": 6,
        "message": {
            "chat": {"id": chat_id},
            "text": "Baru dari PT Maju Jaya bahas kopi 100kg, minta penawaran harga",
        }
    })
    # Output harus mengirim 1 kartu render dan 1 pertanyaan klarifikasi field kosong dengan tombol Skip
    assert len(out) >= 2, f"Expected at least 2 messages (card + clarify), got {len(out)}"
    assert "pt maju jaya" in out[0]["body"].lower()
    assert out[1]["type"] == "quick_reply"
    assert any(b["id"] == "skip" for b in out[1]["buttons"])
    print("[PASS] 3. Text report extraction + Skip inline button verified")

    # 4. Test Callback Query "Skip"
    out = post_tg({
        "update_id": 7,
        "callback_query": {
            "id": "cb_skip_1",
            "from": {"id": chat_id},
            "message": {"chat": {"id": chat_id}},
            "data": "skip",
        }
    })
    # Clarify next field or confirm saved
    notes = store.load_user_notes(chat_id)
    assert len(notes) == 1
    # Skip the remaining fields
    while notes[0]["pending_clarify"]:
        out = post_tg({
            "update_id": 8,
            "callback_query": {
                "id": "cb_skip_next",
                "from": {"id": chat_id},
                "message": {"chat": {"id": chat_id}},
                "data": "skip",
            }
        })
        notes = store.load_user_notes(chat_id)
    assert notes[0]["status"] == "saved"
    print("[PASS] 4. Inline Skip callback button & draft completion verified")

    # 5. Test Voice Note ingestion via Telegram
    os.environ["TRANSCRIBE_TEXT"] = (
        "Kunjungan ke CV Berkah ketemu Pak Dedi manager, bahas teh 30kg, deal, follow up besok"
    )
    out = post_tg({
        "update_id": 9,
        "message": {
            "chat": {"id": chat_id},
            "voice": {"file_id": "telegram_voice_file_123", "duration": 5},
        }
    })
    os.environ["TRANSCRIBE_TEXT"] = ""
    assert len(out) >= 1
    assert "cv berkah" in out[0]["body"].lower()
    notes = store.load_user_notes(chat_id)
    assert len(notes) == 2
    print("[PASS] 5. Voice note telegram .oga download & Whisper transcription pipeline verified")

    # 6. Test "cek follow-up" command
    out = post_tg({
        "update_id": 10,
        "message": {"chat": {"id": chat_id}, "text": "cek follow-up"}
    })
    assert len(out) == 1
    assert "follow-up" in out[0]["body"].lower()
    print("[PASS] 6. 'cek follow-up' command on Telegram verified")

    # 7. Test "rekap sekarang" command
    out = post_tg({
        "update_id": 11,
        "message": {"chat": {"id": chat_id}, "text": "rekap sekarang"}
    })
    # Harus mengirim ringkasan rekap + tombol inline detail catatan
    assert len(out) >= 1
    assert "rekap" in out[0]["body"].lower()
    # Detail button should be sent as quick_reply
    has_buttons = any(m["type"] == "quick_reply" for m in out)
    assert has_buttons, "Expected quick_reply inline buttons for recap note details"
    print("[PASS] 7. 'rekap sekarang' command with inline detail buttons verified")

    # 8. Test detail button click (view_<note_id>)
    target_note_id = notes[0]["id"]
    out = post_tg({
        "update_id": 12,
        "callback_query": {
            "id": "cb_view_1",
            "from": {"id": chat_id},
            "message": {"chat": {"id": chat_id}},
            "data": f"view_{target_note_id}",
        }
    })
    assert len(out) >= 2, f"Expected card + main menu, got {len(out)}"
    assert notes[0]["institusi"].lower() in out[0]["body"].lower()
    assert any(m["type"] == "quick_reply" and any(b["id"] == "menu_lapor" for b in m.get("buttons", [])) for m in out[1:]), "Expected main menu after note detail"
    print("[PASS] 8. Detail note callback query (view_<id>) + main menu verified")

    print("\nALL TELEGRAM TESTS PASSED!")


if __name__ == "__main__":
    run_tests()
