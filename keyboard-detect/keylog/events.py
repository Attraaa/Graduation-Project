"""Shared dataclasses for keyboard timing and finger attribution."""

from __future__ import annotations

from dataclasses import dataclass, field
import time
from typing import Any, Dict, List, Optional

import numpy as np


@dataclass(frozen=True)
class KeyEvent:
    """One keyboard event captured by an explicit input source."""

    key: str
    event_type: str = "press"
    source: str = "global"
    perf_counter_ns: int = 0
    wall_time_ns: int = 0
    browser_perf_ms: Optional[float] = None
    code: Optional[str] = None
    location: Optional[int] = None
    sequence: int = 0

    @classmethod
    def now(
        cls,
        key: str,
        event_type: str = "press",
        source: str = "external",
        code: Optional[str] = None,
        location: Optional[int] = None,
        sequence: int = 0,
    ) -> "KeyEvent":
        """Build an event with the current process clock."""

        return cls(
            key=key,
            event_type=event_type,
            source=source,
            perf_counter_ns=time.perf_counter_ns(),
            wall_time_ns=time.time_ns(),
            code=code,
            location=location,
            sequence=sequence,
        )

    def to_jsonable(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "event_type": self.event_type,
            "source": self.source,
            "perf_counter_ns": self.perf_counter_ns,
            "wall_time_ns": self.wall_time_ns,
            "browser_perf_ms": self.browser_perf_ms,
            "code": self.code,
            "location": self.location,
            "sequence": self.sequence,
        }


@dataclass(frozen=True)
class FingerPoint:
    """A fingertip position in image pixels."""

    hand: str
    finger: str
    x: float
    y: float
    score: float = 1.0
    landmark_id: int = -1

    def to_jsonable(self) -> Dict[str, Any]:
        return {
            "hand": self.hand,
            "finger": self.finger,
            "x": self.x,
            "y": self.y,
            "score": self.score,
            "landmark_id": self.landmark_id,
        }


@dataclass
class FrameSnapshot:
    """One camera frame plus timing metadata.

    ``perf_counter_ns`` is the server-side receive time. If the frame came from
    the browser test page, ``browser_perf_ms`` is the browser-side capture time.
    Browser key events can be matched against this value without crossing clock
    domains.
    """

    frame: np.ndarray
    perf_counter_ns: int
    wall_time_ns: int
    sequence: int = 0
    browser_perf_ms: Optional[float] = None
    fingers: List[FingerPoint] = field(default_factory=list)

    @property
    def width(self) -> int:
        return int(self.frame.shape[1])

    @property
    def height(self) -> int:
        return int(self.frame.shape[0])

    def to_jsonable(self, include_image: bool = False) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "sequence": self.sequence,
            "perf_counter_ns": self.perf_counter_ns,
            "wall_time_ns": self.wall_time_ns,
            "browser_perf_ms": self.browser_perf_ms,
            "size": [self.width, self.height],
            "fingers": [f.to_jsonable() for f in self.fingers],
        }
        if include_image:
            data["image_shape"] = list(self.frame.shape)
        return data


@dataclass
class PressAnalysis:
    """Result of matching one key event to one frame and fingertip set."""

    ok: bool
    key_event: KeyEvent
    frame_sequence: Optional[int] = None
    frame_delta_ms: Optional[float] = None
    keyboard_ok: bool = False
    keyboard_reason: Optional[str] = None
    pressed_key: Optional[str] = None
    pressed_finger: Optional[Dict[str, Any]] = None
    finger_keys: List[Dict[str, Any]] = field(default_factory=list)
    keyboard: Dict[str, Any] = field(default_factory=dict)
    latency: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None

    def to_jsonable(self) -> Dict[str, Any]:
        return {
            "ok": self.ok,
            "key_event": self.key_event.to_jsonable(),
            "frame_sequence": self.frame_sequence,
            "frame_delta_ms": self.frame_delta_ms,
            "keyboard_ok": self.keyboard_ok,
            "keyboard_reason": self.keyboard_reason,
            "pressed_key": self.pressed_key,
            "pressed_finger": self.pressed_finger,
            "finger_keys": self.finger_keys,
            "keyboard": self.keyboard,
            "latency": self.latency,
            "error": self.error,
        }
