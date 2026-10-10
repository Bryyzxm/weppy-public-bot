"""Local JSON storage with atomic writes.

Two files (see spec.md > Data Model):
- data/profile.json : one object (nickname, language, recap_time, ...)
- data/notes.json   : list of pipeline notes

Writes go to a temp file + os.replace so a crash can't corrupt data.
"""

import json
import os
import tempfile
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
PROFILE_PATH = DATA_DIR / "profile.json"
NOTES_PATH = DATA_DIR / "notes.json"
SEEN_PATH = DATA_DIR / "processed_updates.json"
SEEN_KEEP = 200

DEFAULT_PROFILE = {
    "sender_allowlist": [],
    "nickname": "",
    "language": "id",
    "recap_time": "17:00",
    "onboarding_stage": "new",
    "pending_setting": "",
    "last_seen": {},
    "last_sender": "",
    "pending_notices": [],
    "recap_picklist": [],
    "last_recap_date": "",
    "last_followup_date": "",
}


def ensure_data() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not PROFILE_PATH.exists():
        save_profile(dict(DEFAULT_PROFILE))
    if not NOTES_PATH.exists():
        save_notes([])


def _atomic_write(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def load_profile() -> dict:
    try:
        with open(PROFILE_PATH, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return dict(DEFAULT_PROFILE)
        merged = dict(DEFAULT_PROFILE)
        merged.update(data)
        return merged
    except (FileNotFoundError, json.JSONDecodeError):
        return dict(DEFAULT_PROFILE)


def save_profile(profile: dict) -> None:
    _atomic_write(PROFILE_PATH, profile)


def load_notes() -> list:
    try:
        with open(NOTES_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def save_notes(notes: list) -> None:
    _atomic_write(NOTES_PATH, notes)


def claim_update(update_id) -> bool:
    """Klaim update_id Telegram agar hanya diproses satu kali.

    Dipakai di satu titik (_process_telegram_update) sehingga update yang
    sama tidak dibalas dua kali walau dua proses (polling ganda / polling +
    webhook) menerima update yang sama. Berbasis file + flock antar-proses.
    Return True = pertama kali (lanjut proses), False = duplikat (skip).
    """
    try:
        uid = int(update_id)
    except (TypeError, ValueError):
        return True  # tanpa id valid -> proses seperti biasa
    import fcntl

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    # buka/buat file state, kunci eksklusif selama baca-ubah-tulis
    with open(SEEN_PATH, "a+", encoding="utf-8") as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX)
        except OSError:
            pass
        f.seek(0)
        try:
            raw = f.read()
            seen = json.loads(raw) if raw.strip() else []
            if not isinstance(seen, list):
                seen = []
        except (json.JSONDecodeError, ValueError):
            seen = []
        if uid in seen:
            return False
        seen.append(uid)
        del seen[:-SEEN_KEEP]
        f.seek(0)
        f.truncate()
        json.dump(seen, f)
        try:
            fcntl.flock(f, fcntl.LOCK_UN)
        except OSError:
            pass
    return True
