"""Voice-note transcription via Groq Whisper (slice 4).

Spec refs: Components (Transkripsi Voice Note), External Services
(Groq Whisper), Failure Modes (VN tidak jelas, media kedaluwarsa).

Contract: transcribe_audio() returns {"text": str, "status": "ok"|"unclear"}.
Empty/low-confidence/failed transcription -> "unclear" so the router
asks for clarification instead of hallucinating a card.
Stub mode (GROQ_STUB=1 or dummy key) uses TRANSCRIBE_TEXT env for tests.
"""

import os

WHISPER_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
DEFAULT_WHISPER_MODEL = os.getenv("GROQ_WHISPER_MODEL", "whisper-large-v3")


def _stub() -> bool:
    if os.getenv("GROQ_STUB", "0") == "1":
        return True
    key = os.getenv("GROQ_API_KEY", "")
    return not key or "dummy" in key.lower() or "test" in key.lower()


def transcribe_audio(audio_bytes: bytes, filename: str = "voice.ogg") -> dict:
    if _stub():
        text = os.getenv("TRANSCRIBE_TEXT", "").strip()
        if len(text) < 3:
            return {"text": "", "status": "unclear"}
        return {"text": text[:2000], "status": "ok"}

    import requests

    try:
        resp = requests.post(
            WHISPER_URL,
            headers={"Authorization": f"Bearer {os.getenv('GROQ_API_KEY', '')}"},
            files={"file": (filename, audio_bytes, "audio/ogg")},
            data={
                "model": os.getenv("GROQ_WHISPER_MODEL", DEFAULT_WHISPER_MODEL),
                "response_format": "json",
            },
            timeout=60,
        )
        resp.raise_for_status()
        text = str(resp.json().get("text", "") or "").strip()
    except Exception:
        return {"text": "", "status": "unclear"}
    if len(text) < 3:
        return {"text": "", "status": "unclear"}
    return {"text": text[:2000], "status": "ok"}
