"""
Persistent conversation history — saves every message to history.json
so it survives server restarts.
"""

import json
import os
import threading
from datetime import datetime

HISTORY_FILE = os.path.join(os.path.dirname(__file__), 'history.json')
_lock = threading.Lock()


def _load() -> list:
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return []


def _save(data: list):
    with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def add_entry(role: str, text: str, mode: str = 'tutor'):
    """Append a message to history (thread-safe)."""
    with _lock:
        data = _load()
        data.append({
            'id': len(data) + 1,
            'role': role,           # 'user' | 'assistant'
            'text': text,
            'mode': mode,
            'timestamp': datetime.now().isoformat(),
        })
        _save(data)


def get_all() -> list:
    with _lock:
        return _load()


def get_recent(n: int = 50) -> list:
    with _lock:
        return _load()[-n:]


def clear():
    with _lock:
        _save([])
    print('[History] Cleared.')
