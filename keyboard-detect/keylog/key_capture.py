"""Explicit ON/OFF keyboard event capture.

This module does not hide itself, persist typed text, or send data anywhere by
itself. It only emits normalized key events to callbacks while running.
"""

from __future__ import annotations

import threading
import time
from typing import Callable, Iterable, Optional

from .events import KeyEvent


KeyCallback = Callable[[KeyEvent], None]


SPECIAL_KEY_NAMES = {
    "space": "Spacebar",
    "backspace": "Backspace",
    "tab": "Tab",
    "enter": "Enter",
    "caps_lock": "CapsLock",
    "shift_l": "L-Shift",
    "shift_r": "R-Shift",
    "ctrl_l": "L-Ctrl",
    "ctrl_r": "R-Ctrl",
    "alt_l": "L-Alt",
    "alt_r": "R-Alt",
    "cmd_l": "L-Win",
    "cmd_r": "R-Win",
    "menu": "Menu",
}


CODE_NAMES = {
    "Backquote": "~",
    "Minus": "-",
    "Equal": "=",
    "Backslash": "\\",
    "BracketLeft": "[",
    "BracketRight": "]",
    "Semicolon": ";",
    "Quote": "'",
    "Comma": ",",
    "Period": ".",
    "Slash": "/",
    "Space": "Spacebar",
    "Backspace": "Backspace",
    "Tab": "Tab",
    "Enter": "Enter",
    "CapsLock": "CapsLock",
    "ShiftLeft": "L-Shift",
    "ShiftRight": "R-Shift",
    "ControlLeft": "L-Ctrl",
    "ControlRight": "R-Ctrl",
    "AltLeft": "L-Alt",
    "AltRight": "R-Alt",
    "MetaLeft": "L-Win",
    "MetaRight": "R-Win",
    "ContextMenu": "Menu",
}


def normalize_key_name(key, code: Optional[str] = None, location: Optional[int] = None) -> str:
    """Normalize pynput/browser keys to names used by perfect_map.json."""

    if code and code in CODE_NAMES:
        return CODE_NAMES[code]

    if isinstance(key, str):
        if len(key) == 1:
            return key.upper() if key.isalpha() else key
        return SPECIAL_KEY_NAMES.get(key, key)

    char = getattr(key, "char", None)
    if char:
        return char.upper() if char.isalpha() else char

    raw_name = getattr(key, "name", None)
    if raw_name:
        return SPECIAL_KEY_NAMES.get(raw_name, raw_name)

    text = str(key)
    if text.startswith("Key."):
        text = text[4:]
    return SPECIAL_KEY_NAMES.get(text, text)


class RealTimeKeyLogger:
    """Small opt-in wrapper around pynput's keyboard listener."""

    def __init__(
        self,
        on_event: Optional[KeyCallback] = None,
        allowed_keys: Optional[Iterable[str]] = None,
        capture_repeats: bool = False,
    ):
        self.on_event = on_event
        self.allowed_keys = set(allowed_keys) if allowed_keys else None
        self.capture_repeats = capture_repeats
        self._listener = None
        self._lock = threading.Lock()
        self._pressed = set()
        self._sequence = 0

    @property
    def running(self) -> bool:
        return self._listener is not None

    def start(self) -> None:
        """Start capturing key presses until ``stop`` is called."""

        with self._lock:
            if self._listener is not None:
                return
            try:
                from pynput import keyboard
            except ImportError as exc:
                raise RuntimeError(
                    "pynput is required for global key capture. "
                    "Install it with: pip install pynput"
                ) from exc

            self._listener = keyboard.Listener(
                on_press=self._on_press,
                on_release=self._on_release,
            )
            self._listener.start()

    def stop(self) -> None:
        """Stop capture and clear transient pressed-key state."""

        with self._lock:
            listener = self._listener
            self._listener = None
            self._pressed.clear()
        if listener is not None:
            listener.stop()

    def _on_press(self, key) -> None:
        normalized = normalize_key_name(key)
        if self.allowed_keys is not None and normalized not in self.allowed_keys:
            return

        repeat_key = str(key)
        if not self.capture_repeats:
            with self._lock:
                if repeat_key in self._pressed:
                    return
                self._pressed.add(repeat_key)

        self._sequence += 1
        event = KeyEvent(
            key=normalized,
            event_type="press",
            source="global",
            perf_counter_ns=time.perf_counter_ns(),
            wall_time_ns=time.time_ns(),
            sequence=self._sequence,
        )
        if self.on_event:
            self.on_event(event)

    def _on_release(self, key) -> None:
        with self._lock:
            self._pressed.discard(str(key))
