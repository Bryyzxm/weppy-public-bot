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

DEFAULT_PROFILE = {
    "sender_allowlist": [],
    "nickname": "",
    "language": "id",
    "recap_time": "17:00",
    "onboarding_stage": "new",
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
