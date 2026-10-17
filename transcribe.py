"""Voice-note transcription for the legacy local Python demo.

Public Worker transcription is implemented in `src/worker.ts` and sends audio
through Groq without loading a local model.
"""

import os
import tempfile

WHISPER_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
DEFAULT_WHISPER_MODEL = os.getenv("GROQ_WHISPER_MODEL", "whisper-large-v3")
MAX_AUDIO_BYTES = int(os.getenv("TRANSCRIBE_MAX_MB", "20")) * 1024 * 1024
_local_model = None
_local_model_name = None


def _stub() -> bool:
    if os.getenv("GROQ_STUB", "0") == "1":
        return True
    key = os.getenv("GROQ_API_KEY", "")
    return not key or "dummy" in key.lower() or "test" in key.lower()


def _backend() -> str:
    return os.getenv("TRANSCRIBE_BACKEND", "auto").strip().lower() or "auto"


def _transcribe_groq(audio_bytes: bytes, filename: str) -> dict | None:
    import requests

    try:
        response = requests.post(
            WHISPER_URL,
            headers={"Authorization": f"Bearer {os.getenv('GROQ_API_KEY', '')}"},
            files={"file": (filename, audio_bytes, "audio/ogg")},
            data={
                "model": os.getenv("GROQ_WHISPER_MODEL", DEFAULT_WHISPER_MODEL),
                "response_format": "json",
            },
            timeout=60,
        )
        response.raise_for_status()
        transcription = str(response.json().get("text", "") or "").strip()
    except Exception as error:
        print(f"[transcribe] Groq request failed: {type(error).__name__}")
        return None
    if len(transcription) < 3:
        return {"text": "", "status": "unclear"}
    return {"text": transcription[:2000], "status": "ok"}


def _local_model_instance():
    global _local_model, _local_model_name
    model_name = os.getenv("LOCAL_WHISPER_MODEL", "small").strip() or "small"
    if _local_model is not None and _local_model_name == model_name:
        return _local_model
    from faster_whisper import WhisperModel

    _local_model = WhisperModel(
        model_name,
        device=os.getenv("LOCAL_WHISPER_DEVICE", "cpu").strip() or "cpu",
        compute_type=os.getenv("LOCAL_WHISPER_COMPUTE", "int8").strip() or "int8",
    )
    _local_model_name = model_name
    return _local_model


def _transcribe_local(audio_bytes: bytes) -> dict:
    try:
        model = _local_model_instance()
        with tempfile.NamedTemporaryFile(suffix=".ogg", delete=True) as audio_file:
            audio_file.write(audio_bytes)
            audio_file.flush()
            segments, _ = model.transcribe(audio_file.name, language=os.getenv("LOCAL_WHISPER_LANG", "id"), beam_size=1)
            transcription = "".join(segment.text for segment in segments).strip()
    except Exception as error:
        print(f"[transcribe] local transcription unavailable: {type(error).__name__}")
        return {"text": "", "status": "unclear"}
    if len(transcription) < 3:
        return {"text": "", "status": "unclear"}
    return {"text": transcription[:2000], "status": "ok"}


def transcribe_audio(audio_bytes: bytes, filename: str = "voice.ogg") -> dict:
    if not audio_bytes or len(audio_bytes) > MAX_AUDIO_BYTES:
        return {"text": "", "status": "unclear"}
    if _stub():
        transcription = os.getenv("TRANSCRIBE_TEXT", "").strip()
        return {"text": transcription[:2000], "status": "ok"} if len(transcription) >= 3 else {
            "text": "", "status": "unclear"
        }
    backend = _backend()
    if backend == "local":
        return _transcribe_local(audio_bytes)
    remote_result = _transcribe_groq(audio_bytes, filename)
    if remote_result and remote_result.get("status") == "ok":
        return remote_result
    if backend == "groq":
        return remote_result or {"text": "", "status": "unclear"}
    local_result = _transcribe_local(audio_bytes)
    return local_result if local_result.get("status") == "ok" else (remote_result or local_result)
