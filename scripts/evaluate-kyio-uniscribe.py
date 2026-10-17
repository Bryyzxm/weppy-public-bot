"""Evaluate the user-identified UniScribe route using synthetic audio only.

Run: .venv/bin/python scripts/evaluate-kyio-uniscribe.py
Reuses first recorded Kyio request; compares all 4 fixtures with fresh Groq STT.
At most 6 Kyio functional calls including first result and URL-mode/repeat.
No automatic retries, deployment, customer data, or Telegram credentials.
Signed audio URLs are consumed in memory only and redacted from evidence.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import statistics
import time
import sys
from urllib.parse import parse_qs, urlparse

import requests
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "devpost" / "kyio-evaluation"
ENDPOINT = "https://api.kyio.web.id/api/v2/ai/transcribe"
LOCAL = dotenv_values(ROOT / ".env")
GROQ_KEY = os.environ.get("GROQ_API_KEY") or LOCAL.get("GROQ_API_KEY")
GROQ_MODEL = os.environ.get("GROQ_WHISPER_MODEL") or LOCAL.get("GROQ_WHISPER_MODEL") or "whisper-large-v3"
BASELINE = json.loads((OUT / "audio-results.json").read_text())

spec = importlib.util.spec_from_file_location("audio_baseline", Path(__file__).with_name("evaluate-kyio-audio.py"))
if spec is None or spec.loader is None:
    raise RuntimeError("Cannot load audio scoring helpers")
audio_scoring = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audio_scoring)


def sanitize_payload(value: object) -> object:
    if isinstance(value, dict):
        sanitized = {}
        for key, item in value.items():
            if isinstance(item, str) and (key == "audioUrl" or "X-Amz-Signature=" in item):
                url = urlparse(item)
                query = parse_qs(url.query)
                sanitized[key] = {"redacted_signed_url": True, "scheme": url.scheme, "host": url.hostname, "path_suffix": Path(url.path).suffix, "expires_seconds": query.get("X-Amz-Expires", [None])[0], "sha256": hashlib.sha256(item.encode()).hexdigest(), "note": "Signed URL expiry is not proof of audio deletion or retention period."}
            else:
                sanitized[key] = sanitize_payload(item)
        return sanitized
    if isinstance(value, list):
        return [sanitize_payload(item) for item in value]
    return value


def score(text: str, fixture: dict) -> dict:
    normalized = " ".join(re.findall(r"\w+", text.casefold()))
    return {"literal_word_error_rate": audio_scoring.wer(fixture["reference"], text), "key_terms": {term: term in normalized for term in fixture["expected_terms"]}, "date_preserved": bool(re.search(r"(?:20\s+oktober\s+2026|october\s+20\s*,?\s*2026)", text, re.I)) if fixture["language"] != "none" else None, "hallucination_on_silence": bool(text.strip()) if fixture["language"] == "none" else None}


def request(provider: str, fixture: dict, url_input: str | None = None) -> dict:
    path = OUT / fixture["file"]
    row = {"provider": provider, "fixture": path.name, "started_at": dt.datetime.now(dt.timezone.utc).isoformat(), "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "input_mode": "GET url" if url_input else "POST multipart file", "http_status": None}
    started = time.perf_counter()
    try:
        if provider == "kyio_uniscribe" and url_input:
            response = requests.get(ENDPOINT, params={"url": url_input}, timeout=(10, 90))
        else:
            with path.open("rb") as stream:
                if provider == "kyio_uniscribe":
                    response = requests.post(ENDPOINT, files={"file": ("voice.ogg", stream, "audio/ogg")}, timeout=(10, 90))
                else:
                    response = requests.post("https://api.groq.com/openai/v1/audio/transcriptions", headers={"Authorization": f"Bearer {GROQ_KEY}"}, data={"model": GROQ_MODEL, "response_format": "json"}, files={"file": ("voice.ogg", stream, "audio/ogg")}, timeout=(10, 90))
        row.update(http_status=response.status_code, elapsed_ms=round((time.perf_counter() - started) * 1000, 2), headers={k: v for k, v in response.headers.items() if any(t in k.lower() for t in ["content-type", "ratelimit", "retry-after"])})
        try:
            payload = response.json()
        except ValueError:
            payload = {"non_json_preview": response.text[:500]}
        row["response"] = sanitize_payload(payload)
        result = payload.get("result", {}) if provider == "kyio_uniscribe" else payload
        text = result.get("text", "") if isinstance(result, dict) else ""
        row["transcript"] = text if isinstance(text, str) else ""
        row["score"] = score(row["transcript"], fixture)
        if not response.ok or provider == "kyio_uniscribe" and payload.get("status") is not True:
            row["score"] = None
    except requests.RequestException as error:
        row.update(transport_error=type(error).__name__, elapsed_ms=round((time.perf_counter() - started) * 1000, 2))
    return row


def finalize(report: dict) -> None:
    summary = {}
    for provider in ["kyio_uniscribe", "groq_fresh"]:
        rows = [row for row in report["records"] if row["provider"] == provider]
        base_rows = [row for row in rows if not row.get("extra_case")]
        speech = [row for row in base_rows if row["fixture"] != "silence.ogg" and row.get("http_status") == 200]
        summary[provider] = {
            "attempts_total": len(rows),
            "base_attempts": len(base_rows),
            "base_http_200": sum(row.get("http_status") == 200 for row in base_rows),
            "speech_median_ms": round(statistics.median(row["elapsed_ms"] for row in speech), 2) if speech else None,
            "speech_key_terms": sum(sum((row.get("score") or {}).get("key_terms", {}).values()) for row in speech),
            "speech_expected_terms": sum(len((row.get("score") or {}).get("key_terms", {})) for row in speech),
            "speech_dates_preserved": sum(bool((row.get("score") or {}).get("date_preserved")) for row in speech),
            "silence": [{"status": row["http_status"], "transcript": row.get("transcript", ""), "hallucination": (row.get("score") or {}).get("hallucination_on_silence"), "scored": row.get("score") is not None} for row in base_rows if row["fixture"] == "silence.ogg"],
        }
    report["summary"] = summary
    report["finished_at"] = report.get("finished_at") or dt.datetime.now(dt.timezone.utc).isoformat()
    if report.get("stop_reason"):
        report["stopped_at"] = next((row.get("started_at") or row.get("observed_at") for row in reversed(report["records"]) if row.get("http_status") in [401, 403, 429]), None)
        report["finished_at_note"] = "Offline finalization timestamp; live requests stopped at the final recorded rejected request."
        report["remaining_checks"] = "URL mode, repeated upload, fresh Groq silence, and live Worker upload not executed after Kyio HTTP 429. Prior Groq silence result is historical only."
    report["metadata_findings"] = {
        "reported_language_for_english": [row.get("response", {}).get("result", {}).get("language") for row in report["records"] if row["provider"] == "kyio_uniscribe" and row["fixture"] == "voice-en.ogg" and row.get("http_status") == 200],
        "signed_url_expiration_is_not_retention": True,
        "response_text_field": "result.text",
    }
    (OUT / "uniscribe-results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)


def main() -> None:
    if not GROQ_KEY:
        raise RuntimeError("Groq key unavailable; no comparison calls sent")
    first_path = OUT / "uniscribe-initial-results.json"
    first = json.loads(first_path.read_text())
    signed_url = first.get("response", {}).get("result", {}).get("audioUrl")
    if not isinstance(signed_url, str):
        signed_url = None
    fixture_map = {fixture["file"]: fixture for fixture in BASELINE["fixtures"]}
    first["provider"] = "kyio_uniscribe"
    first["input_mode"] = "POST multipart file"
    first["transcript"] = first.get("response", {}).get("result", {}).get("text", "")
    first["score"] = score(first["transcript"], fixture_map[first["fixture"]])
    first["response"] = sanitize_payload(first["response"])
    first_path.write_text(json.dumps(first, ensure_ascii=False, indent=2))
    report = {"started_at": dt.datetime.now(dt.timezone.utc).isoformat(), "endpoint": ENDPOINT, "discovery": "User screenshot identifies GET/POST AI Speech-to-Text Transcribe (UniScribe). Live GET without input returns 400 requiring url or audio/video upload; POST multipart file succeeds without key.", "request_contract": {"upload": "POST multipart/form-data field file; OGG Opus; no auth/language/model parameter", "url": "GET query url referencing only the provider-issued synthetic fixture object, not Telegram or private/internal addresses", "response_text": "result.text"}, "fixtures": BASELINE["fixtures"], "prior_groq_baseline": "audio-results.json", "limitations": ["Tiny synthetic corpus, no real-user/customer recordings, accent diversity, max-size stress or concurrency test.", "Fresh Groq baseline is paired by fixture, but endpoints and timestamps differ.", "No retry or WAF bypass; request rejection 401/403/429 stops evaluation.", "Signed audio URLs redacted; expiration is not a retention/deletion guarantee.", "No TTS contract tested and no production Worker/Telegram deployment changed."], "records": [first]}
    destination = OUT / "uniscribe-results.json"

    def save() -> None:
        destination.write_text(json.dumps(report, ensure_ascii=False, indent=2))

    save()
    last_kyio_started = 0.0
    for fixture in BASELINE["fixtures"]:
        if fixture["file"] != first["fixture"]:
            time.sleep(max(0, 25 - (time.monotonic() - last_kyio_started)))
            last_kyio_started = time.monotonic()
            row = request("kyio_uniscribe", fixture)
            report["records"].append(row)
            save()
            print(json.dumps(row, ensure_ascii=False), flush=True)
            if row["http_status"] in [401, 403, 429]:
                report["stop_reason"] = "Provider rejected access or quota; stopped without retry"
                finalize(report)
                return
        row = request("groq_fresh", fixture)
        report["records"].append(row)
        save()
        print(json.dumps(row, ensure_ascii=False), flush=True)
    for mode in ["repeat_upload", "url"]:
        if mode == "url" and not signed_url:
            report["url_mode"] = "Not tested: original signed URL unavailable/redacted"
            continue
        time.sleep(max(0, 25 - (time.monotonic() - last_kyio_started)))
        last_kyio_started = time.monotonic()
        row = request("kyio_uniscribe", fixture_map["voice-id.ogg"], signed_url if mode == "url" else None)
        row["extra_case"] = mode
        report["records"].append(row)
        save()
        print(json.dumps(row, ensure_ascii=False), flush=True)
        if row["http_status"] in [401, 403, 429]:
            report["stop_reason"] = "Provider rejected access or quota; stopped without retry"
            break
    finalize(report)


if __name__ == "__main__":
    if sys.argv[1:] == ["--summarize"]:
        report = json.loads((OUT / "uniscribe-results.json").read_text())
        fixture_map = {fixture["file"]: fixture for fixture in report["fixtures"]}
        for row in report["records"]:
            row["score"] = score(row.get("transcript", ""), fixture_map[row["fixture"]]) if row.get("http_status") == 200 and (row["provider"] != "kyio_uniscribe" or row.get("response", {}).get("status") is True) else None
        finalize(report)
    elif not sys.argv[1:]:
        main()
    else:
        raise SystemExit("Usage: .venv/bin/python scripts/evaluate-kyio-uniscribe.py [--summarize]")
