"""Telegram long-polling runner.

Allows running the bot locally without ngrok / public webhook URL.
Usage:
    python telegram_poll.py
"""

import atexit
import os
import sys
import time
import requests
from dotenv import load_dotenv

load_dotenv()

from app import _process_telegram_update
import scheduler
import telegram

TELEGRAM_API_BASE = "https://api.telegram.org"
LOCK_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         ".telegram_poll.lock")


def _acquire_lock() -> None:
    """Cegah dua proses polling di mesin yang sama (penyebab utama HTTP 409).

    Menulis PID ke lockfile; kalau lockfile menunjuk ke PID yang masih hidup,
    proses baru langsung berhenti dengan pesan yang jelas.
    """
    pid = str(os.getpid())
    if os.path.exists(LOCK_PATH):
        try:
            with open(LOCK_PATH) as f:
                old = f.read().strip()
            if old.isdigit() and int(old) != os.getpid():
                # Cek apakah PID lama masih hidup.
                try:
                    os.kill(int(old), 0)
                    print(f"[telegram_poll] Proses polling lain masih jalan (PID {old}).")
                    print("[telegram_poll] Matikan dulu proses itu sebelum menjalankan yang baru.")
                    print(f"[telegram_poll] (atau hapus {LOCK_PATH} kalau prosesnya sudah mati.)")
                    sys.exit(1)
                except (OSError, ValueError):
                    pass  # PID lama sudah mati -> ambil alih lock
        except OSError:
            pass
    try:
        with open(LOCK_PATH, "w") as f:
            f.write(pid)
    except OSError as e:
        print(f"[telegram_poll] lock warning: {e}")

    def _release():
        try:
            with open(LOCK_PATH) as f:
                if f.read().strip() == pid:
                    os.unlink(LOCK_PATH)
        except OSError:
            pass

    atexit.register(_release)


def _api(tok: str, method: str, **kwargs):
    return requests.post(f"{TELEGRAM_API_BASE}/bot{tok}/{method}",
                         timeout=kwargs.pop("timeout", 15), **kwargs)


def poll() -> None:
    tok = telegram.token()
    if not tok or telegram.is_stub():
        print("[telegram_poll] TELEGRAM_BOT_TOKEN is dummy or empty. Set a valid token in .env to poll.")
        return

    _acquire_lock()
    scheduler.start()
    print(f"[telegram_poll] Polling started (token ending with ...{tok[-6:] if len(tok) >= 6 else tok})")
    print("[telegram_poll] Press Ctrl+C to stop.")

    # Validasi token lebih awal supaya salah token tidak disangka 409.
    try:
        me = _api(tok, "getMe").json()
        if not me.get("ok"):
            print(f"[telegram_poll] Token tidak valid: {me}")
            return
        print(f"[telegram_poll] Bot: @{me.get('result', {}).get('username', '?')}")
    except Exception as e:
        print(f"[telegram_poll] getMe warning: {e}")

    # getUpdates dan webhook tidak bisa aktif bersamaan. Hapus webhook
    # (termasuk yang dipasang deployment publik / BotFather) supaya
    # polling tidak langsung 409.
    try:
        info = _api(tok, "getWebhookInfo").json().get("result", {})
        if info.get("url"):
            print(f"[telegram_poll] Webhook aktif ({info['url']}) -> hapus agar polling bisa jalan.")
    except Exception as e:
        print(f"[telegram_poll] getWebhookInfo notice: {e}")
    try:
        r = _api(tok, "deleteWebhook", json={"drop_pending_updates": False}, timeout=10)
        print(f"[telegram_poll] deleteWebhook: {r.text[:120]}")
    except Exception as e:
        print(f"[telegram_poll] deleteWebhook notice: {e}")

    offset = 0
    backoff_409 = 0
    while True:
        try:
            resp = requests.get(
                f"{TELEGRAM_API_BASE}/bot{tok}/getUpdates",
                params={"offset": offset, "timeout": 20},
                timeout=30,
            )
            if resp.status_code == 409:
                # Penyebab umum: proses polling kedua, atau webhook dipasang
                # ulang (mis. server Flask + setWebhook jalan bersamaan).
                backoff_409 += 1
                wait = min(5 * backoff_409, 30)
                print(f"[telegram_poll] HTTP 409: {resp.text[:160]}")
                print("[telegram_poll] Penyebab umum: (1) dua `telegram_poll.py` jalan "
                      "bersamaan, atau (2) webhook bot masih aktif (server Flask / "
                      "deployment lain memanggil setWebhook).")
                print(f"[telegram_poll] Coba hapus webhook lagi, tunggu {wait}s ...")
                try:
                    _api(tok, "deleteWebhook", json={"drop_pending_updates": False}, timeout=10)
                except Exception as e:
                    print(f"[telegram_poll] deleteWebhook retry notice: {e}")
                time.sleep(wait)
                continue
            backoff_409 = 0
            if resp.status_code != 200:
                print(f"[telegram_poll] HTTP {resp.status_code}: {resp.text[:160]}")
                time.sleep(2)
                continue
            data = resp.json()
            updates = data.get("result", [])
            for u in updates:
                offset = max(offset, u.get("update_id", 0) + 1)
                try:
                    _process_telegram_update(u)
                except Exception as e:
                    print(f"[telegram_poll] update handler error: {e}")
        except KeyboardInterrupt:
            print("\n[telegram_poll] Polling stopped.")
            break
        except Exception as e:
            print(f"[telegram_poll] network error: {e}")
            time.sleep(2)


if __name__ == "__main__":
    poll()
