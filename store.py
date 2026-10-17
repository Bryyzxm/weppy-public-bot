"""Local JSON persistence for the retained Python demonstration.

Public deployments use `src/worker.ts` and Cloudflare D1. Local Python chat
notes use separate files under `data/users/<chat_id>/notes.json`.
"""

import json
import os
import tempfile
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path
from typing import Optional

DATA_DIR = Path(__file__).resolve().parent / "data"
PROFILE_PATH = DATA_DIR / "profile.json"
NOTES_PATH = DATA_DIR / "notes.json"
SEEN_PATH = DATA_DIR / "processed_updates.json"
SEEN_KEEP = 200
_owner_id: ContextVar[Optional[str]] = ContextVar("store_owner_id", default=None)

DEFAULT_USER_PROFILE = {
    "nickname": "",
    "language": "id",
    "recap_time": "17:00",
    "onboarding_stage": "new",
    "pending_setting": "",
    "recap_picklist": [],
    "last_recap_date": "",
    "last_followup_date": "",
}
DEFAULT_PROFILE = {
    **DEFAULT_USER_PROFILE,
    "sender_allowlist": [],
    "last_seen": {},
    "last_sender": "",
    "pending_notices": [],
    "users": {},
}


def _fresh_default_profile() -> dict:
    import copy

    return copy.deepcopy(DEFAULT_PROFILE)


@contextmanager
def user_scope(owner_id):
    token = _owner_id.set(str(owner_id) if owner_id is not None else None)
    try:
        yield
    finally:
        _owner_id.reset(token)


def _atomic_write(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, indent=2)
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def ensure_data() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not PROFILE_PATH.exists():
        save_profile(_fresh_default_profile())
    if not NOTES_PATH.exists():
        save_notes([])


def load_profile() -> dict:
    try:
        with open(PROFILE_PATH, encoding="utf-8") as file:
            data = json.load(file)
    except (FileNotFoundError, json.JSONDecodeError):
        return _fresh_default_profile()
    if not isinstance(data, dict):
        return _fresh_default_profile()
    profile = _fresh_default_profile()
    profile.update(data)
    if not isinstance(profile.get("users"), dict):
        profile["users"] = {}
    for key in ("last_seen",):
        if not isinstance(profile.get(key), dict):
            profile[key] = {}
    for key in ("sender_allowlist", "pending_notices", "recap_picklist"):
        if not isinstance(profile.get(key), list):
            profile[key] = []
    return profile


def save_profile(profile: dict) -> None:
    _atomic_write(PROFILE_PATH, profile)


def get_user_profile(profile: dict, sender) -> dict:
    owner = str(sender)
    users = profile.setdefault("users", {})
    existing = users.get(owner)
    user_profile = dict(DEFAULT_USER_PROFILE)
    if isinstance(existing, dict):
        user_profile.update(existing)
    users[owner] = user_profile
    return user_profile


def load_user_profile(owner_id) -> dict:
    return get_user_profile(load_profile(), owner_id)


def save_user_profile(owner_id, user_profile: dict) -> None:
    profile = load_profile()
    profile.setdefault("users", {})[str(owner_id)] = user_profile
    save_profile(profile)


def _notes_path(owner_id=None) -> Path:
    if owner_id is None:
        return NOTES_PATH
    owner = "".join(character for character in str(owner_id) if character.isalnum() or character in "-_")
    return DATA_DIR / "users" / owner / "notes.json"


def _load_notes_file(path: Path) -> list:
    try:
        with open(path, encoding="utf-8") as file:
            notes = json.load(file)
        return notes if isinstance(notes, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def load_user_notes(owner_id) -> list:
    return _load_notes_file(_notes_path(owner_id))


def save_user_notes(owner_id, notes: list) -> None:
    _atomic_write(_notes_path(owner_id), notes)


def load_notes() -> list:
    return _load_notes_file(_notes_path(_owner_id.get()))


def save_notes(notes: list) -> None:
    _atomic_write(_notes_path(_owner_id.get()), notes)


def migrate_legacy_profile_if_needed() -> bool:
    profile = load_profile()
    if profile.get("users") or profile.get("onboarding_stage") != "done":
        return False
    sender = str(profile.get("last_sender") or "")
    if not sender:
        return False
    user_profile = dict(DEFAULT_USER_PROFILE)
    for key in DEFAULT_USER_PROFILE:
        if key in profile:
            user_profile[key] = profile[key]
    profile["users"][sender] = user_profile
    profile.update(_fresh_default_profile())
    profile["users"] = {sender: user_profile}
    save_profile(profile)
    return True


def claim_update(update_id) -> bool:
    try:
        update_number = int(update_id)
    except (TypeError, ValueError):
        return True
    import fcntl

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(SEEN_PATH, "a+", encoding="utf-8") as file:
        fcntl.flock(file, fcntl.LOCK_EX)
        file.seek(0)
        try:
            seen = json.loads(file.read() or "[]")
            if not isinstance(seen, list):
                seen = []
        except (json.JSONDecodeError, ValueError):
            seen = []
        if update_number in seen:
            return False
        seen.append(update_number)
        del seen[:-SEEN_KEEP]
        file.seek(0)
        file.truncate()
        json.dump(seen, file)
        fcntl.flock(file, fcntl.LOCK_UN)
    return True
