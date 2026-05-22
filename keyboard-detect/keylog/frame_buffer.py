"""Thread-safe rolling frame buffer with nearest-time lookup."""

from __future__ import annotations

from collections import deque
from threading import Lock
from typing import Deque, Optional, Tuple

from .events import FrameSnapshot, KeyEvent


class FrameBuffer:
    """Keep recent frames so key events can be matched after small delays."""

    def __init__(self, max_frames: int = 180):
        self.max_frames = max_frames
        self._frames: Deque[FrameSnapshot] = deque(maxlen=max_frames)
        self._lock = Lock()

    def add(self, snapshot: FrameSnapshot) -> None:
        with self._lock:
            self._frames.append(snapshot)

    def latest(self) -> Optional[FrameSnapshot]:
        with self._lock:
            return self._frames[-1] if self._frames else None

    def clear(self) -> None:
        with self._lock:
            self._frames.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._frames)

    def nearest_for_event(
        self,
        event: KeyEvent,
        camera_receive_delay_ms: float = 80.0,
    ) -> Tuple[Optional[FrameSnapshot], Optional[float]]:
        """Return the nearest frame and signed frame-event delta in ms.

        Browser test-page events use browser ``performance.now()`` for both
        frames and keydown events. Global OS events use server receive time,
        adjusted by an estimated camera transport delay.
        """

        with self._lock:
            frames = list(self._frames)
        if not frames:
            return None, None

        if event.browser_perf_ms is not None:
            candidates = [f for f in frames if f.browser_perf_ms is not None]
            if candidates:
                target = event.browser_perf_ms
                best = min(candidates, key=lambda f: abs((f.browser_perf_ms or 0.0) - target))
                return best, float((best.browser_perf_ms or 0.0) - target)

        target_ns = event.perf_counter_ns + int(camera_receive_delay_ms * 1_000_000)
        best = min(frames, key=lambda f: abs(f.perf_counter_ns - target_ns))
        delta_ms = (best.perf_counter_ns - target_ns) / 1_000_000
        return best, float(delta_ms)
