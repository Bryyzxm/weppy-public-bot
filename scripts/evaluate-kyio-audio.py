"""Measure Groq's existing STT baseline with synthetic OGG/Opus fixtures only.

Run after fixture encoding: .venv/bin/python scripts/evaluate-kyio-audio.py
No Kyio audio endpoint is guessed. Exact accessible docs are a prerequisite.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

import requests
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "devpost" / "kyio-evaluation"
LOCAL = dotenv_values(ROOT / ".env")
KEY = os.environ.get("GROQ_API_KEY") or LOCAL.get("GROQ_API_KEY")
MODEL = os.environ.get("GROQ_WHISPER_MODEL") or LOCAL.get("GROQ_WHISPER_MODEL") or "whisper-large-v3"
REFERENCE_ID = "Saya mengunjungi perusahaan Contoh Nusantara. Bertemu Sari, manajer pembelian. Menawarkan mesin kopi. Masih negosiasi, belum deal. Hubungi lagi tanggal dua puluh Oktober dua ribu dua puluh enam."
REFERENCE_EN = "I visited Example North Limited. I met Alice, the procurement manager, to offer coffee machines. We are still negotiating and no contract has been signed. Follow up on October twentieth, twenty twenty six."
FIXTURES = [
    {"file": "voice-id.ogg", "reference": REFERENCE_ID, "expected_terms": ["contoh nusantara", "sari", "manajer pembelian", "mesin kopi", "negosiasi", "belum deal"], "language": "id", "source": "macOS say Damayanti id_ID, 145 words/minute"},
    {"file": "voice-en.ogg", "reference": REFERENCE_EN, "expected_terms": ["example north", "alice", "procurement manager", "coffee machines", "negotiating", "no contract"], "language": "en", "source": "macOS say Samantha en_US, 145 words/minute"},
    {"file": "voice-id-noisy.ogg", "reference": REFERENCE_ID, "expected_terms": ["contoh nusantara", "sari", "manajer pembelian", "mesin kopi", "negosiasi", "belum deal"], "language": "id", "source": "voice-id.ogg mixed with pink noise at amplitude 0.025; not a calibrated SNR test"},
    {"file": "silence.ogg", "reference": "", "expected_terms": [], "language": "none", "source": "3 seconds generated digital silence"},
]


def words(text: str) -> list[str]:
    return re.findall(r"\w+", text.casefold())


def wer(reference: str, actual: str) -> float | None:
    r, a = words(reference), words(actual)
    if not r:
        return None
    previous = list(range(len(a) + 1))
    for i, word in enumerate(r, 1):
        current = [i]
        for j, other in enumerate(a, 1):
            current.append(min(current[-1] + 1, previous[j] + 1, previous[j - 1] + (word != other)))
        previous = current
    return round(previous[-1] / len(r), 4)


def main() -> None:
    if not KEY:
        raise RuntimeError("Groq credential unavailable; no requests sent")
    report = {"started_at": dt.datetime.now(dt.timezone.utc).isoformat(), "provider": "Groq", "model": MODEL, "endpoint": "https://api.groq.com/openai/v1/audio/transcriptions", "production_contract": "multipart model + response_format=json + file voice.ogg audio/ogg; no language or prompt field", "kyio": {"status": "blocked", "reason": "No accessible exact official STT/TTS endpoint contract and no Kyio key; no endpoint guessing or audio requests."}, "limitations": ["Synthetic speech, not real Telegram microphone speech or accent diversity.", "Word error rate is literal, so number formatting can count as an error despite preserved meaning.", "No production Telegram or Cloudflare deployment exercised."], "fixtures": FIXTURES, "records": []}
    for fixture in FIXTURES:
        path = OUT / fixture["file"]
        metadata = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration,size:stream=codec_name,sample_rate,channels", "-of", "json", str(path)], text=True))
        row = {"fixture": fixture["file"], "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "media": metadata}
        start = time.perf_counter()
        try:
            with path.open("rb") as stream:
                response = requests.post(report["endpoint"], headers={"Authorization": f"Bearer {KEY}"}, data={"model": MODEL, "response_format": "json"}, files={"file": ("voice.ogg", stream, "audio/ogg")}, timeout=(10, 60))
            row.update(http_status=response.status_code, elapsed_ms=round((time.perf_counter() - start) * 1000, 2))
            try:
                row["response"] = response.json()
            except ValueError:
                row["response"] = {"non_json_preview": response.text[:200]}
            value = row["response"]
            text = value.get("text", "") if isinstance(value, dict) else ""
            row["transcript"] = text
            row["literal_word_error_rate"] = wer(fixture["reference"], text)
            row["key_terms"] = {term: term in " ".join(words(text)) for term in fixture["expected_terms"]}
            row["hallucination_on_silence"] = bool(text.strip()) if fixture["language"] == "none" else None
        except requests.RequestException as error:
            row.update(transport_error=type(error).__name__, elapsed_ms=round((time.perf_counter() - start) * 1000, 2))
        report["records"].append(row)
        (OUT / "audio-results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps(row, ensure_ascii=False), flush=True)
        if row.get("http_status") in [401, 403, 429]:
            break
    report["finished_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
    (OUT / "audio-results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
