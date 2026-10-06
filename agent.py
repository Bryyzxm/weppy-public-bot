"""Agent otak: ekstraksi laporan + render kartu (slices 3-5).

Spec refs: Components (Agent Otak), Data Model (notes.json),
External Services (Groq API), Failure Modes (Groq lambat/limit).

Two backends:
- Real Groq chat completions (JSON mode) when GROQ_API_KEY is set.
- Deterministic keyword stub when the key is empty/dummy or GROQ_STUB=1,
  so verification and demos work offline. The stub obeys the same
  contract: unknown fields stay "" (never hallucinated).
"""

import datetime as _dt
import json
import os
import re

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

FIELD_ORDER = ["institusi", "kontak", "role", "produk", "tahap_deal"]

# Canonical deal stages are stored in Indonesian (stable grouping);
# display translates them per profile language. Anything else
# (e.g. the user's own words) passes through untouched.
STAGE_EN = {
    "Kunjungan awal": "Initial visit",
    "Penawaran harga": "Price quote",
    "Negosiasi": "Negotiation",
    "Deal": "Deal",
    "Follow-up": "Follow-up",
}


def stage_label(value: str, lang: str) -> str:
    v = (value or "").strip()
    if lang == "en":
        return STAGE_EN.get(v, v)
    return v

MONTH_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
            "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


class GroqError(RuntimeError):
    pass


def is_stub() -> bool:
    if os.getenv("GROQ_STUB", "0") == "1":
        return True
    key = os.getenv("GROQ_API_KEY", "")
    return not key or "dummy" in key.lower() or "test" in key.lower()


# --- Real Groq path ---

EXTRACTION_SYSTEM = """You extract B2B sales visit reports (Indonesian or English) into strict JSON.
Output ONLY a JSON object with exactly these keys:
{"institusi": str, "kontak": str, "role": str, "produk": str, "tahap_deal": str, "followup_date": str}
Rules:
- Empty string for anything not stated. NEVER invent names, companies, products, or stages.
- institusi: company/institution name. kontak: person's name WITHOUT title (titles go to role context). role: job title/role, "" if unknown.
- produk: product/service discussed, "" if unknown.
- tahap_deal: one of "Kunjungan awal", "Penawaran harga", "Negosiasi", "Deal", "Follow-up", or "" if unclear.
- followup_date: next follow-up as YYYY-MM-DD guessed from the report; explicit dates win, "besok/tomorrow" means +1 day, "minggu depan/next week" means +7 days, otherwise +3 days from today. Today is {today}.
- Keep values short (<= 80 chars)."""


def _extract_via_groq(text: str) -> dict:
    import requests

    today = _dt.date.today().isoformat()
    resp = requests.post(
        GROQ_URL,
        headers={"Authorization": f"Bearer {os.getenv('GROQ_API_KEY', '')}",
                 "Content-Type": "application/json"},
        json={
            "model": os.getenv("GROQ_MODEL", DEFAULT_MODEL),
            "temperature": 0,
            "max_tokens": 500,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system",
                 "content": EXTRACTION_SYSTEM.replace("{today}", today)},
                {"role": "user", "content": text},
            ],
        },
        timeout=30,
    )
    if resp.status_code != 200:
        raise GroqError(f"groq http {resp.status_code}: {resp.text[:160]}")
    try:
        data = resp.json()
        raw = data["choices"][0]["message"]["content"]
        parsed = json.loads(raw)
    except (KeyError, IndexError, ValueError) as e:
        raise GroqError(f"bad groq response: {e}")
    return _normalize(parsed)


def _normalize(parsed: dict) -> dict:
    out = {k: str(parsed.get(k, "") or "").strip()[:80] for k in FIELD_ORDER}
    out["followup_date"] = _valid_date(str(parsed.get("followup_date", "") or ""))
    return out


def _valid_date(s: str) -> str:
    try:
        _dt.date.fromisoformat(s)
        return s
    except ValueError:
        return _default_followup()


def _default_followup(days: int = 3) -> str:
    return (_dt.date.today() + _dt.timedelta(days=days)).isoformat()


# --- Deterministic stub (offline verification / demo without key) ---

_STOP = r"(?:ketemu|bertemu|dengan|dari|bahas|membahas|beli|membeli|pesan|memesan|minta|untuk|yang|dan|di|ke|pada|tentang|terkait|met|discussed|ordered|asked|for|with|from|about)\b"

_ROLE_WORDS = [
    "purchasing", "procurement", "manager", "manajer", "direktur", "director",
    "owner", "pemilik", "staff", "admin", "kepala", "supervisor", "HRD",
    "finance", "keuangan", "marketing", "apoteker", "dokter", "perawat",
    "buyer", "sales", "teknisi", "operator", "sekretaris", "bendahara",
]


def _stub_extract(text: str) -> dict:
    out = {k: "" for k in FIELD_ORDER}

    m = re.search(
        r"\b(PT|CV|UD|PD|Yayasan|Universitas|Univ|RS|RSUD|RSUP|Dinas|Klinik|Apotek|Toko)\s+"
        r"([A-Za-z][\w&.]*(?:\s+[A-Za-z][\w&.]+){0,4})",
        text,
    )
    if m:
        name = f"{m.group(1)} {m.group(2)}".strip()
        name = re.split(rf"\s+{_STOP}", name, maxsplit=1)[0].strip(" ,.")
        out["institusi"] = name[:80]

    m = re.search(
        r"\b(Ibu|Bapak|Pak|Bu|Mbak|Mas|Mrs\.?|Mr\.?|Ms\.?)\s+([A-ZAa-z][\w.]*)", text
    )
    if m:
        out["kontak"] = f"{m.group(1)} {m.group(2)}".strip()[:80]

    low = text.lower()
    for w in _ROLE_WORDS:
        if re.search(rf"\b{re.escape(w)}\b", low):
            i = low.index(w)
            out["role"] = text[i:i + len(w)][:80]
            break

    m = re.search(
        r"\b(bahas|membahas|beli|membeli|pesan|memesan|order|butuh|minta\s+penawaran|"
        r"discussed|ordered|need(?:s|ed)?)\b\s+([^,.;]{3,80})",
        text, re.IGNORECASE,
    )
    if m:
        prod = m.group(2).strip()
        prod = re.split(rf"\s+{_STOP}", prod, maxsplit=1)[0].strip(" ,.")
        if len(prod) >= 3:
            out["produk"] = prod[:80]

    if re.search(r"penawaran|quote|quotation|pricelist|daftar harga|quotation", low):
        out["tahap_deal"] = "Penawaran harga"
    elif re.search(r"nego|tawar|diskon", low):
        out["tahap_deal"] = "Negosiasi"
    elif re.search(r"\bdeal\b|closing|sepakat|setuju|\bPO\b|bayar|payment|lunas", low):
        out["tahap_deal"] = "Deal"
    elif re.search(r"follow|lanjut|kabar", low):
        out["tahap_deal"] = "Follow-up"
    elif re.search(r"kunjungan|perkenalan|prospek|baru kenal|kenalan", low):
        out["tahap_deal"] = "Kunjungan awal"

    if re.search(r"besok|tomorrow", low):
        out["followup_date"] = _default_followup(1)
    elif re.search(r"lusa", low):
        out["followup_date"] = _default_followup(2)
    elif re.search(r"minggu depan|next week", low):
        out["followup_date"] = _default_followup(7)
    else:
        out["followup_date"] = _default_followup(3)
    return out


def extract_report(text: str) -> dict:
    """Text -> {5 fields + followup_date}. Raises GroqError on AI failure."""
    if is_stub():
        return _stub_extract(text or "")
    return _extract_via_groq(text or "")


# --- Card rendering (spec.md > Look and Feel) ---

LABELS = {
    "id": {
        "title": "*Catatan kunjungan*",
        "institusi": "Institusi/Perusahaan",
        "kontak": "Kontak + Role",
        "produk": "Produk/Layanan",
        "tahap": "Tahap Deal",
        "followup": "Follow-up",
        "filled": "Terisi",
        "missing": "Belum ada",
        "hint": 'Balas di chat untuk melengkapi / ketik Skip.',
        "complete": "Semua lengkap, catatan tersimpan.",
    },
    "en": {
        "title": "*Visit note*",
        "institusi": "Institution/Company",
        "kontak": "Contact + Role",
        "produk": "Product/Service",
        "tahap": "Deal Stage",
        "followup": "Follow-up",
        "filled": "Filled",
        "missing": "Missing",
        "hint": "Reply in chat to complete / type Skip.",
        "complete": "All complete, note saved.",
    },
}


def format_date(ymd: str, lang: str) -> str:
    try:
        d = _dt.date.fromisoformat(ymd)
    except ValueError:
        return ymd
    months = MONTH_EN if lang == "en" else MONTH_ID
    return f"{d.day:02d} {months[d.month - 1]} {d.year}"


def missing_fields(note: dict) -> list:
    return [f for f in FIELD_ORDER if not (note.get(f) or "").strip()]


def render_card(note: dict, lang: str) -> str:
    L = LABELS.get(lang, LABELS["id"])
    F, M = L["filled"], L["missing"]

    def val(v: str) -> str:
        v = (v or "").strip()
        return f"{F}: {v}" if v else M

    kontak, role = (note.get("kontak") or "").strip(), (note.get("role") or "").strip()
    if kontak and role:
        kontak_line = f"{F}: {kontak} ({role})"
    elif kontak:
        kontak_line = f"{F}: {kontak} (Role: {M})"
    elif role:
        kontak_line = f"{F}: ({role})"
    else:
        kontak_line = M

    lines = [
        L["title"],
        f"{L['institusi']}: {val(note.get('institusi', ''))}",
        f"{L['kontak']}: {kontak_line}",
        f"{L['produk']}: {val(note.get('produk', ''))}",
        f"{L['tahap']}: {val(stage_label(note.get('tahap_deal', ''), lang))}",
        f"{L['followup']}: {format_date(note.get('followup_date', ''), lang)}",
        L["hint"],
    ]
    if not missing_fields(note):
        lines.append(L["complete"])
    return "\n".join(lines)


def new_note_id(notes: list) -> str:
    today = _dt.date.today().strftime("%Y%m%d")
    seq = len([n for n in notes if str(n.get('id', '')).startswith(today)]) + 1
    return f"{today}-{seq:03d}"
