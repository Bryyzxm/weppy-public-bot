"""Voice-note transcription: Groq Whisper primary, local fallback.

Slices: 4 (transkripsi VN). Contract: transcribe_audio() returns
{"text": str, "status": "ok"|"unclear"}. Empty/low-confidence/failed
transcription -> "unclear" so the router asks for clarification
instead of hallucinating a card.

Backend selection via TRANSCRIBE_BACKEND (default "auto"):
- "groq": only Groq (old behavior).
- "local": only local faster-whisper (no network call).
- "auto": try Groq first, fall back to local on any Groq failure
  (rate limit 429, 5xx, timeout, network error).

Stub mode (GROQ_STUB=1 or dummy key) uses TRANSCRIBE_TEXT env for
tests — unchanged, except TRANSCRIBE_BACKEND=local forces local path.
"""

import os
import tempfile

# --- PyAV compat shim (faster-whisper 1.2.x + PyAV >=16) ---
# faster-whisper 1.2.1 memanggil av.open(..., metadata_errors="ignore"),
# tapi PyAV 19 (yang terinstal via `pip install faster-whisper`) sudah
# menghapus kwarg itu -> TypeError: open() got an unexpected keyword
# argument 'metadata_errors'. Akibatnya SEMUA transkripsi lokal gagal
# dengan "[transcribe] local inference failed: TypeError ..." dan user
# selalu dapat balasan "suaranya kurang jelas" (vn_unclear).
# Shim ini membuang kwarg tersebut sebelum meneruskannya, sehingga
# decode OGG Opus Telegram tetap jalan tanpa harus downgrade `av`.
try:
    import av as _av

    _av_open_orig = _av.open

    def _av_open_compat(file, mode="r", **kwargs):
        kwargs.pop("metadata_errors", None)
        return _av_open_orig(file, mode=mode, **kwargs)

    _av.open = _av_open_compat  # type: ignore[attr-defined]
except ImportError:
    pass  # faster-whisper belum terinstal; error dilaporkan saat load model

WHISPER_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
DEFAULT_WHISPER_MODEL = os.getenv("GROQ_WHISPER_MODEL", "whisper-large-v3")
# 20 MB guard: Groq caps at 25 MB; bigger files would OOM a small VPS
# on the local path anyway.
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
    """Return ok-dict, unclear-dict, or None if Groq failed (-> fallback)."""
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
    except Exception as e:
        print(f"[transcribe] Groq request failed: {type(e).__name__}: {e}")
        return None
    if len(text) < 3:
        return {"text": "", "status": "unclear"}
    return {"text": text[:2000], "status": "ok"}


def _get_local_model():
    """Lazy singleton so the ~250MB model loads once per process."""
    global _local_model, _local_model_name
    name = os.getenv("LOCAL_WHISPER_MODEL", "small").strip() or "small"
    if _local_model is not None and _local_model_name == name:
        return _local_model
    from faster_whisper import WhisperModel

    device = os.getenv("LOCAL_WHISPER_DEVICE", "cpu").strip() or "cpu"
    compute = os.getenv("LOCAL_WHISPER_COMPUTE", "int8").strip() or "int8"
    _local_model = WhisperModel(name, device=device, compute_type=compute)
    _local_model_name = name
    return _local_model


def _use_vad() -> bool:
    return os.getenv("LOCAL_WHISPER_VAD", "1").strip() not in ("0", "false", "no", "off")


def _transcribe_local(audio_bytes: bytes) -> dict:
    try:
        model = _get_local_model()
    except ImportError:
        print("[transcribe] local fallback unavailable: faster-whisper not installed")
        return {"text": "", "status": "unclear"}
    except Exception as e:
        print(f"[transcribe] local model load failed: {type(e).__name__}: {e}")
        return {"text": "", "status": "unclear"}
    suffix = ".ogg"
    tmp_path = ""
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(audio_bytes)
            tmp_path = f.name
        lang = os.getenv("LOCAL_WHISPER_LANG", "id").strip() or "id"
        print(f"[transcribe] local infer: {len(audio_bytes)} bytes, "
              f"model={os.getenv('LOCAL_WHISPER_MODEL', 'small')}, lang={lang}")
        vad = _use_vad()
        segments, _info = model.transcribe(
            tmp_path,
            language=lang,
            beam_size=1,
            vad_filter=vad,
        )
        text = "".join(s.text for s in segments).strip()
        # VAD agresif kadang membuang VN pendek -> coba sekali lagi tanpa VAD
        # sebelum menyerah sebagai "unclear".
        if len(text) < 3 and vad:
            print("[transcribe] local VAD pass empty, retry without VAD")
            segments, _info = model.transcribe(
                tmp_path,
                language=lang,
                beam_size=1,
                vad_filter=False,
            )
            text = "".join(s.text for s in segments).strip()
        print(f"[transcribe] local result: {len(text)} chars")
    except Exception as e:
        print(f"[transcribe] local inference failed: {type(e).__name__}: {e}")
        return {"text": "", "status": "unclear"}
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
    if len(text) < 3:
        return {"text": "", "status": "unclear"}
    return {"text": text[:2000], "status": "ok"}


def transcribe_audio(audio_bytes: bytes, filename: str = "voice.ogg") -> dict:
    backend = _backend()
    if backend not in ("auto", "groq", "local"):
        backend = "auto"

    if not audio_bytes or len(audio_bytes) > MAX_AUDIO_BYTES:
        return {"text": "", "status": "unclear"}

    # Local-only mode skips stub/Groq entirely (production escape hatch).
    if backend == "local":
        return _transcribe_local(audio_bytes)

    if _stub():
        text = os.getenv("TRANSCRIBE_TEXT", "").strip()
        if len(text) < 3:
            return {"text": "", "status": "unclear"}
        return {"text": text[:2000], "status": "ok"}

    if backend == "groq":
        result = _transcribe_groq(audio_bytes, filename)
        return result if result is not None else {"text": "", "status": "unclear"}

    # auto: Groq primary, local fallback on Groq failure OR Groq "unclear".
    # (Groq bisa mengembalikan teks kosong untuk audio yang sebenarnya
    #  valid — mis. glitch jaringan/audio — jadi coba lokal dulu sebelum
    #  menyerah sebagai vn_unclear.)
    result = _transcribe_groq(audio_bytes, filename)
    if result is not None:
        if result.get("status") == "ok":
            return result
        print("[transcribe] Groq unclear, trying local faster-whisper")
        local = _transcribe_local(audio_bytes)
        return local if local.get("status") == "ok" else result
    print("[transcribe] falling back to local faster-whisper")
    return _transcribe_local(audio_bytes)
