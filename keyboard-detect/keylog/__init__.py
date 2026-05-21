"""Realtime keyboard press attribution helpers.

This package is intentionally opt-in: key capture starts only after callers
explicitly call ``start()`` or the local test server receives a start command.
"""

from .analyzer import KeyboardPressAnalyzer
from .events import FingerPoint, FrameSnapshot, KeyEvent, PressAnalysis
from .frame_buffer import FrameBuffer
from .key_capture import RealTimeKeyLogger, normalize_key_name

__all__ = [
    "FingerPoint",
    "FrameBuffer",
    "FrameSnapshot",
    "KeyboardPressAnalyzer",
    "KeyEvent",
    "PressAnalysis",
    "RealTimeKeyLogger",
    "normalize_key_name",
]
