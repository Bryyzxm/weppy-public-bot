"""WhatsApp Cloud API connector (see spec.md > Components: WhatsApp Connector).

Three send paths: free text, quick-reply buttons, approved templates.
Media download helper arrives in slice 4; kept out of slice 1 on purpose.

Stub mode: when WHATSAPP_TOKEN / PHONE_NUMBER_ID are empty or dummy
(or WHATSAPP_STUB=1), nothing hits the network. Messages are appended
to OUTBOX and printed, so Flask test-client verification works offline.
"""

import os

import requests

OUTBOX: list = []

GRAPH_VERSION = os.getenv("GRAPH_API_VERSION", "v21.0")


def is_stub() -> bool:
    if os.getenv("WHATSAPP_STUB", "0") == "1":
        return True
    token = os.getenv("WHATSAPP_TOKEN", "")
    phone_id = os.getenv("PHONE_NUMBER_ID", "")
    if not token or not phone_id:
        return True
    low = (token + " " + phone_id).lower()
    return low.startswith("dummy") or "dummy" in low or "test" in low


def _post(payload: dict):
    phone_id = os.getenv("PHONE_NUMBER_ID", "")
    token = os.getenv("WHATSAPP_TOKEN", "")
    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{phone_id}/messages"
    resp = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json()


def _log(line: str) -> None:
    if os.getenv("WHATSAPP_QUIET", "0") != "1":
        print(line)


def send_text(to: str, body: str):
    entry = {"to": to, "type": "text", "body": body}
    if is_stub():
        OUTBOX.append(entry)
        _log(f"[stub send_text to={to}] {body}")
        return {"stub": True}
    return _post(
        {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"body": body},
        }
    )


def send_quick_reply(to: str, body: str, buttons: list):
    """buttons: list of {"id": str, "title": str}, max 3, title <= 20 chars."""
    if len(buttons) > 3:
        raise ValueError("Cloud API allows max 3 quick-reply buttons")
    for b in buttons:
        if len(b.get("title", "")) > 20:
            raise ValueError(f"Button title too long: {b.get('title')!r}")
    entry = {"to": to, "type": "quick_reply", "body": body, "buttons": buttons}
    if is_stub():
        OUTBOX.append(entry)
        _log(f"[stub quick_reply to={to}] {body} | {buttons}")
        return {"stub": True}
    return _post(
        {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": body},
                "action": {
                    "buttons": [
                        {
                            "type": "reply",
                            "reply": {"id": b["id"], "title": b["title"]},
                        }
                        for b in buttons
                    ]
                },
            },
        }
    )


def send_template(to: str, name: str, language_code: str, parameters: list):
    """Approved template for outside the 24h window (slice 6 uses this)."""
    entry = {
        "to": to,
        "type": "template",
        "name": name,
        "language": language_code,
        "parameters": parameters,
    }
    if is_stub():
        OUTBOX.append(entry)
        _log(f"[stub template to={to}] {name}/{language_code} {parameters}")
        return {"stub": True}
    components = []
    if parameters:
        components = [
            {
                "type": "body",
                "parameters": [{"type": "text", "text": str(p)} for p in parameters],
            }
        ]
    return _post(
        {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": name,
                "language": {"code": language_code},
                "components": components,
            },
        }
    )


def clear_outbox() -> None:
    OUTBOX.clear()


class WhatsappError(RuntimeError):
    pass


def download_media(media_id: str) -> bytes:
    """Two-step voice-note download: GET /{media-id} -> temp URL -> bytes.

    The temp URL expires in ~5 minutes, so this runs immediately
    inside the webhook handler (spec.md > Important Failure Modes).
    Stub mode returns fake bytes; the transcribe stub ignores content.
    """
    if is_stub():
        return b"fake-ogg-opus-audio"

    phone_token = os.getenv("WHATSAPP_TOKEN", "")
    meta = requests.get(
        f"https://graph.facebook.com/{GRAPH_VERSION}/{media_id}",
        headers={"Authorization": f"Bearer {phone_token}"},
        timeout=20,
    )
    if meta.status_code != 200:
        raise WhatsappError(f"media lookup http {meta.status_code}")
    url = (meta.json() or {}).get("url", "")
    if not url:
        raise WhatsappError("media lookup returned no url")

    dl = requests.get(
        url,
        headers={"Authorization": f"Bearer {phone_token}"},
        timeout=60,
    )
    if dl.status_code != 200 or not dl.content:
        raise WhatsappError(f"media download http {dl.status_code}")
    return dl.content
