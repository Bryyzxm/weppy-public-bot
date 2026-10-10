"""Penjadwal + rekap/follow-up (slice 6).

Spec refs: Components (Penjadwal dan Pemicu Demo), External Services
(aturan 24 jam + template ID/EN), Important Failure Modes (template
belum APPROVED / di luar window).

Same-function rule: the scheduled jobs and the demo commands
(`rekap sekarang`, `cek follow-up`) call the same build/send functions,
so automatic and demo output are identical.

24h-window rule: free text only works within 24h of the sales rep's
last message (tracked in profile.last_seen). Outside the window the
POC uses one approved template per language with a single {{1}}
variable carrying the whole summary. Template names follow
spec.md; override with TEMPLATE_FOLLOWUP_ID/EN, TEMPLATE_RECAP_ID/EN.
"""

import datetime as _dt
import os

import store
import telegram
import whatsapp
from agent import format_date, stage_label


def transport_module():
    mode = os.getenv("CHAT_TRANSPORT", "telegram").strip().lower()
    return telegram if mode == "telegram" else whatsapp

TEMPLATES = {
    "id": {"code": "id", "followup": "followup_reminder_id", "recap": "daily_recap_id"},
    "en": {"code": "en_US", "followup": "followup_reminder_en", "recap": "daily_recap_en"},
}

FOLLOWUP_CHECK_TIME = "08:00"
WINDOW_HOURS = 24


def _tpl(lang: str, kind: str) -> tuple:
    base = TEMPLATES.get(lang, TEMPLATES["id"])
    env_key = f"TEMPLATE_{kind.upper()}_{lang.upper()}"
    return os.getenv(env_key, base[kind]), base["code"]


def _today() -> _dt.date:
    return _dt.date.today()


def in_window(profile: dict, sender: str) -> bool:
    seen = (profile.get("last_seen") or {}).get(sender, "")
    if not seen:
        return False
    try:
        last = _dt.datetime.fromisoformat(seen)
    except ValueError:
        return False
    return (_dt.datetime.now() - last) < _dt.timedelta(hours=WINDOW_HOURS)


def _recipient(profile: dict) -> str:
    allow = profile.get("sender_allowlist") or []
    if allow:
        return allow[0]
    return profile.get("last_sender", "")


# --- Message builders (pure: notes + lang + date -> text) ---


def build_recap_text(notes: list, lang: str, ref: _dt.date) -> str:
    no_stage = "No stage yet" if lang == "en" else "Belum ada tahap"
    groups: dict = {}
    order: list = []
    for n in notes:
        stage = (n.get("tahap_deal") or "").strip() or no_stage
        if stage not in groups:
            groups[stage] = []
            order.append(stage)
        groups[stage].append(n)

    date_s = format_date(ref.isoformat(), lang)
    if not notes:
        return (
            "No notes stored yet. Send a visit report to start."
            if lang == "en"
            else "Belum ada catatan tersimpan. Kirim laporan kunjungan untuk memulai."
        )
    title = f"*Pipeline recap — {date_s}*" if lang == "en" else f"*Rekap pipeline — {date_s}*"
    lines = [title]
    for stage in order:
        members = groups[stage]
        lines.append(f"*{stage_label(stage, lang)} ({len(members)}):*")
        for n in members:
            lines.append(f"\u2022 {_recap_line(n, lang)}")

    tomorrow = (ref + _dt.timedelta(days=1)).isoformat()
    due = [n for n in notes if (n.get("followup_date") or "") == tomorrow]
    if due:
        head = (
            f"*Follow-ups tomorrow ({format_date(tomorrow, lang)}):*"
            if lang == "en"
            else f"*Follow-up besok ({format_date(tomorrow, lang)}):*"
        )
        lines.append(head)
        for n in due:
            lines.append(f"\u2022 {_followup_item(n, lang)}")
    return "\n".join(lines)


def _recap_line(n: dict, lang: str) -> str:
    """One structured line per note: company — contact (role) | product | follow-up."""
    inst = (n.get("institusi") or "").strip() or (
        "(unnamed)" if lang == "en" else "(tanpa nama)"
    )
    kontak = (n.get("kontak") or "").strip()
    role = (n.get("role") or "").strip()
    if kontak and role:
        who = f"{kontak} ({role})"
    elif kontak:
        who = kontak
    else:
        who = "(no contact)" if lang == "en" else "(tanpa kontak)"
    prod = (n.get("produk") or "").strip() or (
        "(no product)" if lang == "en" else "(tanpa produk)"
    )
    fu = format_date(n.get("followup_date", ""), lang)
    return f"{inst} \u2014 {who} | {prod} | Follow-up {fu}"


def _followup_item(n: dict, lang: str) -> str:
    kontak = (n.get("kontak") or "").strip() or (
        "(no contact)" if lang == "en" else "(tanpa kontak)"
    )
    inst = (n.get("institusi") or "").strip()
    prod = (n.get("produk") or "").strip()
    bit = kontak + (f" ({inst})" if inst else "")
    if prod:
        bit += f" \u2014 {prod}"
    return bit


def build_followup_text(notes: list, lang: str, ref: _dt.date) -> str:
    today_s = ref.isoformat()
    due = [n for n in notes if (n.get("followup_date") or "") <= today_s]
    date_s = format_date(today_s, lang)
    if not due:
        return (
            f"No follow-ups today ({date_s})."
            if lang == "en"
            else f"Tidak ada follow-up hari ini ({date_s})."
        )
    title = (
        f"*Follow-up reminders — {date_s}*"
        if lang == "en"
        else f"*Pengingat follow-up — {date_s}*"
    )
    lines = [title]
    for n in due:
        item = _followup_item(n, lang)
        try:
            late = (ref - _dt.date.fromisoformat(n["followup_date"])).days
        except (ValueError, KeyError):
            late = 0
        if late > 0:
            item += (
                f" ({late} days overdue)" if lang == "en" else f" (terlewat {late} hari)"
            )
        lines.append(f"\u2022 {item}")
    return "\n".join(lines)


# --- Sending (window-aware, with template fallback + notice queue) ---


def _send_window_aware(profile: dict, sender: str, lang: str, kind: str, body: str) -> bool:
    """True if delivered. Template failure queues a notice for next chat."""
    trans = transport_module()
    if trans == telegram:
        telegram.send_text(sender, body)
        return True
    if in_window(profile, sender):
        whatsapp.send_text(sender, body)
        return True
    name, code = _tpl(lang, kind)
    try:
        whatsapp.send_template(sender, name, code, [body])
        return True
    except Exception as e:
        print(f"[scheduler] template {name} failed: {e}")
        notices = profile.get("pending_notices") or []
        notices.append(body)
        profile["pending_notices"] = notices
        store.save_profile(profile)
        return False


def send_recap_to(profile: dict, sender: str, ref=None) -> bool:
    ref = ref or _today()
    lang = profile.get("language", "id")
    body = build_recap_text(store.load_notes(), lang, ref)
    if not _send_window_aware(profile, sender, lang, "recap", body):
        return False
    trans = transport_module()
    if trans == telegram or in_window(profile, sender):
        send_recap_details(profile, sender, lang)
    return True


def send_followups_to(profile: dict, sender: str, ref=None) -> bool:
    ref = ref or _today()
    lang = profile.get("language", "id")
    body = build_followup_text(store.load_notes(), lang, ref)
    return _send_window_aware(profile, sender, lang, "followup", body)


DETAIL_TEXT = {
    "id": "Lihat laporan lengkap — ketuk tombol atau balas nomor:",
    "en": "View full report — tap a button or reply with the number:",
}
NOTE_GONE = {
    "id": "Catatan itu sudah tidak ada.",
    "en": "That note is gone.",
}


def _display_name(n: dict, lang: str) -> str:
    return (n.get("institusi") or "").strip() or (
        "(unnamed)" if lang == "en" else "(tanpa nama)"
    )


def send_recap_details(profile: dict, sender: str, lang: str) -> bool:
    """Per-note buttons (max 3 per message) + numbered fallback list.

    The chosen ids land in profile.recap_picklist so a typed number works
    even where buttons don't render. Best-effort: if the channel rejects
    interactive messages, the numbered text still goes out.
    """
    notes = store.load_notes()
    if not notes:
        return True
    pick = [(n.get("id", ""), _display_name(n, lang)) for n in notes]
    profile["recap_picklist"] = [nid for nid, _ in pick]
    store.save_profile(profile)
    chunks = [pick[i:i + 3] for i in range(0, len(pick), 3)]
    base = 0
    for ci, chunk in enumerate(chunks):
        rows = [f"{base + j}. {name}" for j, (_, name) in enumerate(chunk, start=1)]
        body = DETAIL_TEXT.get(lang, DETAIL_TEXT["id"])
        if len(chunks) > 1:
            body += f" ({ci + 1}/{len(chunks)})"
        body += "\n" + "\n".join(rows)
        buttons = [{"id": f"view_{nid}", "title": name[:20]} for nid, name in chunk]
        trans = transport_module()
        try:
            trans.send_quick_reply(sender, body, buttons)
        except Exception as e:
            print(f"[scheduler] buttons failed, numbers only: {e}")
            trans.send_text(sender, body)
        base += len(chunk)
    return True


def find_note(note_id: str) -> dict | None:
    return next((n for n in store.load_notes() if n.get("id") == note_id), None)


def flush_notices(sender: str, profile: dict) -> None:
    notices = profile.get("pending_notices") or []
    if not notices:
        return
    lang = profile.get("language", "id")
    head = (
        "Failed to deliver while you were away:"
        if lang == "en"
        else "Gagal terkirim saat kamu offline:"
    )
    transport_module().send_text(sender, head + "\n" + "\n---\n".join(notices))
    profile["pending_notices"] = []
    store.save_profile(profile)


# --- Background jobs (APScheduler calls run_daily_jobs every minute) ---


def run_daily_jobs(now=None) -> None:
    now = now or _dt.datetime.now()
    profile = store.load_profile()
    if profile.get("onboarding_stage") != "done":
        return
    to = _recipient(profile)
    if not to:
        return
    hm = now.strftime("%H:%M")
    today_s = now.date().isoformat()
    if hm == profile.get("recap_time", "17:00") and profile.get("last_recap_date") != today_s:
        if send_recap_to(profile, to, now.date()):
            profile = store.load_profile()
            profile["last_recap_date"] = today_s
            store.save_profile(profile)
    if hm == FOLLOWUP_CHECK_TIME and profile.get("last_followup_date") != today_s:
        if send_followups_to(profile, to, now.date()):
            profile = store.load_profile()
            profile["last_followup_date"] = today_s
            store.save_profile(profile)


def start():
    """Start the minute-tick scheduler. Idempotent; only called from __main__."""
    from apscheduler.schedulers.background import BackgroundScheduler

    global _sched
    try:
        _sched
    except NameError:
        _sched = None
    if _sched is not None:
        return _sched
    _sched = BackgroundScheduler()
    _sched.add_job(run_daily_jobs, "interval", minutes=1, id="daily_tick")
    _sched.start()
    print("[scheduler] started:", [j.id for j in _sched.get_jobs()])
    return _sched
