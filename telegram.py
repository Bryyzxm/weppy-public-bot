"""Telegram Bot API connector (see spec.md > External Services).

Transport for Telegram bot:
- sendMessage (text + inline keyboard)
- answerCallbackQuery (for inline button clicks)
- getFile + download file (for voice notes .oga/.ogg)
- Stub mode when TELEGRAM_BOT_TOKEN is dummy/empty or TELEGRAM_STUB=1.
"""

from __future__ import annotations

import os
import requests

OUTBOX: list = []
TELEGRAM_API_BASE = "https://api.telegram.org"


def token() -> str:
    return os.getenv("TELEGRAM_BOT_TOKEN", "").strip()


def is_stub() -> bool:
    if os.getenv("TELEGRAM_STUB", "0") == "1":
        return True
    tok = token()
    if not tok:
        return True
    low = tok.lower()
    return "dummy" in low or "test" in low

def clear_outbox() -> None:
    OUTBOX.clear()


def _log(line: str) -> None:
    if os.getenv("TELEGRAM_QUIET", "0") != "1":
        print(line)


def send_text(to: str | int, body: str, parse_mode: str = "Markdown") -> dict:
    entry = {"to": str(to), "type": "text", "body": body}
    if is_stub():
        OUTBOX.append(entry)
        _log(f"[telegram stub send_text to={to}] {body}")
        return {"ok": True, "stub": True}

    url = f"{TELEGRAM_API_BASE}/bot{token()}/sendMessage"
    payload = {"chat_id": str(to), "text": body}
    if parse_mode:
        payload["parse_mode"] = parse_mode

    resp = requests.post(url, json=payload, timeout=20)
    # Retry without parse_mode if Markdown parsing fails on special characters
    if resp.status_code == 400 and parse_mode:
        payload.pop("parse_mode", None)
        resp = requests.post(url, json=payload, timeout=20)
    resp.raise_for_status()
    return resp.json()


def send_quick_reply(to: str | int, body: str, buttons: list, parse_mode: str = "Markdown") -> dict:
    """Send text with inline keyboard buttons.

    `buttons`: list of {"id": str, "title": str}.
    """
    entry = {"to": str(to), "type": "quick_reply", "body": body, "buttons": buttons}
    if is_stub():
        OUTBOX.append(entry)
        _log(f"[telegram stub quick_reply to={to}] {body} | {buttons}")
        return {"ok": True, "stub": True}

    # Stack vertically if any button title is long (>10 chars)
    if len(buttons) > 1 and any(len(b.get("title", "")) > 10 for b in buttons):
        inline_keyboard = [[{"text": b["title"], "callback_data": b["id"]}] for b in buttons]
    else:
        inline_keyboard = [[{"text": b["title"], "callback_data": b["id"]} for b in buttons]]

    url = f"{TELEGRAM_API_BASE}/bot{token()}/sendMessage"
    payload = {
        "chat_id": str(to),
        "text": body,
        "reply_markup": {"inline_keyboard": inline_keyboard},
    }
    if parse_mode:
        payload["parse_mode"] = parse_mode

    resp = requests.post(url, json=payload, timeout=20)
    if resp.status_code == 400 and parse_mode:
        payload.pop("parse_mode", None)
        resp = requests.post(url, json=payload, timeout=20)
    resp.raise_for_status()
    return resp.json()


def send_template(to: str | int, name: str, language_code: str, parameters: list) -> dict:
    """Telegram has no 24h template restrictions. Sends as standard text."""
    body = (parameters or [name])[0] if parameters else name
    return send_text(to, str(body))


def send_document(to: str | int, file_bytes: bytes, filename: str, caption: str = "") -> dict:
    """Kirim file (dipakai ekspor CSV) via sendDocument.

    Stub mode: catat ke OUTBOX type=document agar verifikasi offline bisa
    assert tanpa network.
    """
    entry = {"to": str(to), "type": "document", "filename": filename,
             "caption": caption, "size": len(file_bytes or b"")}
    if is_stub():
        OUTBOX.append(entry)
        _log(f"[telegram stub send_document to={to}] {filename} ({entry['size']} bytes)")
        return {"ok": True, "stub": True}

    url = f"{TELEGRAM_API_BASE}/bot{token()}/sendDocument"
    files = {"document": (filename, file_bytes, "text/csv")}
    data = {"chat_id": str(to)}
    if caption:
        data["caption"] = caption
    resp = requests.post(url, data=data, files=files, timeout=30)
    resp.raise_for_status()
    return resp.json()


def answer_callback_query(callback_query_id: str, text: str = "") -> dict:
    if is_stub():
        return {"ok": True, "stub": True}
    url = f"{TELEGRAM_API_BASE}/bot{token()}/answerCallbackQuery"
    try:
        resp = requests.post(url, json={"callback_query_id": callback_query_id, "text": text}, timeout=10)
        return resp.json()
    except Exception as e:
        print(f"[telegram] answer_callback_query error: {e}")
        return {"ok": False, "error": str(e)}


def _is_retryable_download_error(e: Exception) -> bool:
    """Connection reset / timeout / 5xx = transient, boleh retry.

    4xx (kecuali 429) dan error parsing respons tidak di-retry.
    """
    import requests as _rq

    if isinstance(e, (_rq.exceptions.ConnectionError,
                      _rq.exceptions.ChunkedEncodingError,
                      _rq.exceptions.Timeout)):
        return True
    if isinstance(e, _rq.exceptions.HTTPError):
        status = getattr(getattr(e, "response", None), "status_code", 0) or 0
        return status == 429 or 500 <= status <= 599
    # ConnectionResetError mentah (tanpa wrapper requests) juga retryable.
    # Pesan user: "('Connection aborted.', ConnectionResetError(54, ...))".
    name = type(e).__name__
    if name in ("ConnectionResetError", "ConnectionAbortedError",
                "BrokenPipeError", "RemoteDisconnected"):
        return True
    msg = str(e).lower()
    return ("connection aborted" in msg or "connection reset" in msg
            or "broken pipe" in msg or "remote disconnected" in msg)


def download_voice(file_id: str) -> bytes:
    """Two-step download: getFile -> download .oga/.ogg audio stream.

    Tahan terhadap 'Connection reset by peer' yang sering muncul di
    jaringan lokal/flaky: kedua tahap di-retry dengan exponential
    backoff, dan body diunduh secara streaming (iter_content) supaya
    reset di tengah jalan tidak langsung menggagalkan VN.

    Env:
    - TELEGRAM_DOWNLOAD_RETRIES (default 4)
    - TELEGRAM_DOWNLOAD_TIMEOUT (detik, default 60)
    """
    import time

    if is_stub():
        return b"fake-ogg-opus-audio"
    if not (file_id or "").strip():
        raise RuntimeError("download_voice called with empty file_id")

    max_retries = int(os.getenv("TELEGRAM_DOWNLOAD_RETRIES", "4") or 4)
    timeout = int(os.getenv("TELEGRAM_DOWNLOAD_TIMEOUT", "60") or 60)
    max_retries = max(1, min(max_retries, 8))

    info_url = f"{TELEGRAM_API_BASE}/bot{token()}/getFile"
    file_path = ""
    last_err: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.get(info_url, params={"file_id": file_id}, timeout=20)
            resp.raise_for_status()
            file_path = resp.json().get("result", {}).get("file_path", "")
            if not file_path:
                raise RuntimeError(f"getFile returned no file_path for file_id {file_id}")
            last_err = None
            break
        except Exception as e:
            last_err = e
            if not _is_retryable_download_error(e) or attempt == max_retries:
                raise
            wait = min(2 ** (attempt - 1), 8)
            print(f"[telegram] getFile attempt {attempt}/{max_retries} failed "
                  f"({type(e).__name__}: {e}), retry in {wait}s")
            time.sleep(wait)
    if last_err is not None:
        raise last_err

    file_url = f"{TELEGRAM_API_BASE}/file/bot{token()}/{file_path}"
    last_err = None
    for attempt in range(1, max_retries + 1):
        try:
            with requests.get(file_url, timeout=timeout, stream=True) as dl:
                dl.raise_for_status()
                chunks = bytearray()
                for chunk in dl.iter_content(chunk_size=128 * 1024):
                    if chunk:
                        chunks.extend(chunk)
                if not chunks:
                    raise RuntimeError("downloaded voice file is empty")
                return bytes(chunks)
        except Exception as e:
            last_err = e
            if not _is_retryable_download_error(e) or attempt == max_retries:
                raise
            wait = min(2 ** (attempt - 1), 8)
            print(f"[telegram] download attempt {attempt}/{max_retries} failed "
                  f"({type(e).__name__}: {e}), retry in {wait}s")
            time.sleep(wait)
    # Tidak terjangkau (loop selalu raise/return), tapi untuk type-checker:
    raise last_err if last_err else RuntimeError("voice download failed")
