"""WhatsApp connector, multi backend (see spec.md > Components: WhatsApp Connector,
spec.md > External Services and Dependencies §4 Twilio Sandbox, §5 360dialog,
§6 Fonnte, §7 waapi.app).

`WHATSAPP_BACKEND=meta` (default) talks to Meta Graph API as before.
`WHATSAPP_BACKEND=twilio` talks to the Twilio sandbox: inbound arrives as
form-encoded POSTs on /twilio/inbound, outbound goes to the Twilio
Messages API. Bot behavior (cards, Skip, recap) is identical on both.
`WHATSAPP_BACKEND=d360` talks to the 360dialog sandbox (payload identical
to Meta, inbound reuses /webhook).
`WHATSAPP_BACKEND=fonnte` talks to Fonnte (own device number): inbound
arrives as JSON POSTs on /fonnte/inbound (sender/message/text/url),
outbound goes to POST https://api.fonnte.com/send with header
`Authorization: <FONNTE_TOKEN>`.
`WHATSAPP_BACKEND=waapi` talks to waapi.app (own number via QR,
NOT waapi.co.id): inbound arrives as JSON POSTs on /waapi/inbound
(event=message, data.message._data + data.media base64), outbound goes
to POST https://waapi.app/api/v1/instances/{id}/client/action/send-message
with header `Authorization: Bearer <WAAPI_TOKEN>`.

Three send paths: free text, quick-reply buttons (Meta only — sent as
plain text on Twilio/Fonnte/waapi.app, the Skip instruction stays in the wording),
approved templates (Meta only — Twilio/Fonnte/waapi.app replies stay in-window,
template calls fall back to plain text).

Stub mode: WHATSAPP_STUB=1, dummy creds, or TWILIO_STUB=1 on the Twilio
path. Nothing hits the network; messages land in OUTBOX for Flask
test-client verification.
"""

import os

import requests

from requests.auth import HTTPBasicAuth

OUTBOX: list = []

GRAPH_VERSION = os.getenv("GRAPH_API_VERSION", "v21.0")


def backend() -> str:
    return os.getenv("WHATSAPP_BACKEND", "meta").strip().lower()


def is_stub() -> bool:
    if os.getenv("WHATSAPP_STUB", "0") == "1":
        return True
    if backend() == "twilio":
        if os.getenv("TWILIO_STUB", "0") == "1":
            return True
        sid = os.getenv("TWILIO_ACCOUNT_SID", "")
        tok = os.getenv("TWILIO_AUTH_TOKEN", "")
        if not sid or not tok:
            return True
        return "dummy" in (sid + " " + tok).lower()
    if backend() == "d360":
        key = os.getenv("D360_API_KEY", "")
        if not key:
            return True
        return "dummy" in key.lower()
    if backend() == "fonnte":
        key = os.getenv("FONNTE_TOKEN", "")
        if not key:
            return True
        return "dummy" in key.lower()
    if backend() == "waapi":
        inst = os.getenv("WAAPI_INSTANCE_ID", "")
        key = os.getenv("WAAPI_TOKEN", "")
        if not inst or not key:
            return True
        low = (inst + " " + key).lower()
        return "dummy" in low or "test" in low
    token = os.getenv("WHATSAPP_TOKEN", "")
    phone_id = os.getenv("PHONE_NUMBER_ID", "")
    if not token or not phone_id:
        return True
    low = (token + " " + phone_id).lower()
    return low.startswith("dummy") or "dummy" in low or "test" in low


def _digits(number: str) -> str:
    """'whatsapp:+62812x' or '+62812x' -> '62812x' (internal canonical form)."""
    n = (number or "").strip()
    n = n.removeprefix("whatsapp:")
    n = n.removeprefix("+")
    return "".join(ch for ch in n if ch.isdigit())


def _twilio_to(number: str) -> str:
    return "whatsapp:+" + _digits(number)


def _waapi_chat_id(number: str) -> str:
    """digits -> '<digits>@c.us' (waapi.app individual-chat format)."""
    return _digits(number) + "@c.us"


def _waapi_post(chat_id: str, message: str):
    """Send via waapi.app: POST /instances/{id}/client/action/send-message.

    Header `Authorization: Bearer <WAAPI_TOKEN>`, JSON body
    {chatId, message}. Docs: https://waapi.readme.io (send-text-message).
    Note the double status envelope: HTTP 200 + outer status only means
    the request reached the instance — `data.status` is authoritative.
    A malformed chatId comes back as data.status=error with no send.
    """
    instance = os.getenv("WAAPI_INSTANCE_ID", "")
    resp = requests.post(
        f"https://waapi.app/api/v1/instances/{instance}/client/action/send-message",
        headers={
            "authorization": f"Bearer {os.getenv('WAAPI_TOKEN', '')}",
            "content-type": "application/json",
            "accept": "application/json",
        },
        json={"chatId": chat_id, "message": message},
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json()


def _post(payload: dict):
    if backend() == "d360":
        return _d360_post(payload)
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


def _d360_post(payload: dict):
    """Send via 360dialog sandbox (same payload shape as Meta)."""
    resp = requests.post(
        "https://waba-sandbox.360dialog.io/v1/messages",
        headers={
            "Content-Type": "application/json",
            "D360-API-KEY": os.getenv("D360_API_KEY", ""),
        },
        json=payload,
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json()


def _fonnte_post(target: str, message: str):
    """Send via Fonnte: POST https://api.fonnte.com/send.

    Header is raw `Authorization: <TOKEN>` (no Bearer prefix).
    `target` is digits (e.g. 62812xxxx); leading 0 is converted to 62
    by Fonnte's default countryCode.
    """
    resp = requests.post(
        "https://api.fonnte.com/send",
        headers={"Authorization": os.getenv("FONNTE_TOKEN", "")},
        data={"target": target, "message": message},
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json()


def _twilio_post(data: dict):
    """Send via Twilio Messages API (sandbox From number from env)."""
    sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    tok = os.getenv("TWILIO_AUTH_TOKEN", "")
    sender = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
    payload = {"From": sender, **data}
    resp = requests.post(
        f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
        auth=HTTPBasicAuth(sid, tok),
        data=payload,
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
    if backend() == "twilio":
        return _twilio_post({"To": _twilio_to(to), "Body": body})
    if backend() == "fonnte":
        return _fonnte_post(_digits(to), body)
    if backend() == "waapi":
        return _waapi_post(_waapi_chat_id(to), body)
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
    if backend() == "twilio":
        # Twilio sandbox has no button API on this path — plain text keeps
        # the Skip instruction that already lives in the question wording.
        return send_text(to, body)
    if backend() == "fonnte":
        # Fonnte supports buttons/templates on paper, but POC keeps the
        # same plain-text fallback so cards/Skip/recap stay identical.
        return send_text(to, body)
    if backend() == "waapi":
        # waapi.app is a plain-text/bot API — no Meta quick-reply widget.
        # The Skip instruction already lives in the question wording.
        return send_text(to, body)
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
    """Approved template for outside the 24h window (slice 6 uses this).

    Twilio/Fonnte/waapi.app have no Meta template concept — fall back to
    plain text (own device / in-window sandbox replies don't need templates).
    """
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
    if backend() in ("twilio", "fonnte", "waapi"):
        body = (parameters or [name])[0] if parameters else name
        return send_text(to, str(body))
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


def download_url(url: str, auth=None) -> bytes:
    """Download media bytes from a direct URL (Twilio MediaUrl0 + Basic Auth)."""
    if is_stub():
        return b"fake-ogg-opus-audio"
    dl = requests.get(url, auth=auth, timeout=60)
    if dl.status_code != 200 or not dl.content:
        raise WhatsappError(f"media download http {dl.status_code}")
    return dl.content


def twilio_auth():
    sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    return HTTPBasicAuth(sid, os.getenv("TWILIO_AUTH_TOKEN", ""))


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


def download_twilio_media(url: str) -> bytes:
    """Voice-note download on the Twilio path (MediaUrl0 + account auth)."""
    return download_url(url, auth=twilio_auth())


def download_fonnte_media(url: str) -> bytes:
    """Voice-note/file download on the Fonnte path (public url, no auth)."""
    return download_url(url)


def download_waapi_inline(b64: str) -> bytes:
    """Voice-note bytes already embedded in the waapi.app webhook.

    The message event carries data.media {mimetype, data: base64, ...}
    for voice notes (audio/ogg; codecs=opus), so no extra HTTP call is
    needed. Stub mode returns fake bytes; the transcribe stub ignores
    content and uses TRANSCRIBE_TEXT instead.
    """
    if is_stub():
        return b"fake-ogg-opus-audio"
    import base64

    try:
        return base64.b64decode(b64)
    except Exception as e:
        raise WhatsappError(f"waapi inline media decode failed: {e}")


def download_waapi_media(message_id: str) -> bytes:
    """Voice-note download on the waapi.app path via download-media action.

    POST /instances/{id}/client/action/download-media {messageId} returns
    a temporary signed URL (valid 15 min); the file is then fetched with
    a plain GET. Docs: https://waapi.readme.io/reference/download-media.md
    messageId is the serialized id, e.g. false_62812@c.us_ABCDEF1234.
    """
    if is_stub():
        return b"fake-ogg-opus-audio"
    instance = os.getenv("WAAPI_INSTANCE_ID", "")
    resp = requests.post(
        f"https://waapi.app/api/v1/instances/{instance}/client/action/download-media",
        headers={
            "authorization": f"Bearer {os.getenv('WAAPI_TOKEN', '')}",
            "content-type": "application/json",
            "accept": "application/json",
        },
        json={"messageId": message_id},
        timeout=20,
    )
    resp.raise_for_status()
    payload = resp.json() or {}
    data = payload.get("data") or {}
    inner = (data.get("data") or {}) if isinstance(data, dict) else {}
    media = (inner.get("media") or {}) if isinstance(inner, dict) else {}
    url = media.get("url", "") if isinstance(media, dict) else ""
    if not url:
        raise WhatsappError("waapi download-media returned no url")
    dl = requests.get(url, timeout=60)
    if dl.status_code != 200 or not dl.content:
        raise WhatsappError(f"waapi media download http {dl.status_code}")
    return dl.content
