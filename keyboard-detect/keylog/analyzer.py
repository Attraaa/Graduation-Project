"""Combine key events, MediaPipe fingertips, and keyboard_mapper polygons."""

from __future__ import annotations

import math
import sys
import threading
import time
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import numpy as np

from .events import FingerPoint, FrameSnapshot, KeyEvent, PressAnalysis
from .finger_tracker import MediaPipeFingerTracker
from .key_capture import normalize_key_name


ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from keyboard_mapper import KeyboardCoordinateMapper, KeyboardMappingResult  # noqa: E402


class KeyboardPressAnalyzer:
    """Attribute a captured key press to the fingertip visible on the key."""

    def __init__(
        self,
        mapper: Optional[KeyboardCoordinateMapper] = None,
        finger_tracker: Optional[MediaPipeFingerTracker] = None,
        model_path: Optional[str] = None,
        perfect_map_path: Optional[str] = None,
        imgsz: int = 800,
    ):
        self.mapper = mapper or KeyboardCoordinateMapper(
            model_path=str(model_path or ROOT / "models" / "best.pt"),
            perfect_map_path=str(perfect_map_path or ROOT / "data" / "perfect_map.json"),
            imgsz=imgsz,
            enhance="auto",
            temporal=False,
        )
        self.finger_tracker = finger_tracker
        self._mapping_lock = threading.RLock()
        self._last_mapping: Optional[KeyboardMappingResult] = None
        self._frozen_mapping: Optional[KeyboardMappingResult] = None

    @property
    def frozen(self) -> bool:
        """True when analysis uses a fixed keyboard map instead of live YOLO."""

        with self._mapping_lock:
            return self._frozen_mapping is not None

    def map_keyboard(self, frame, update_last: bool = True) -> KeyboardMappingResult:
        """Run live keyboard mapping and remember the latest good result."""

        with self._mapping_lock:
            result = self.mapper.map_frame(frame)
            if update_last and result.ok:
                self._last_mapping = result
            return result

    def freeze_mapping(
        self,
        mapping_result: Optional[KeyboardMappingResult] = None,
        frame=None,
    ) -> bool:
        """Freeze an existing good mapping, or map ``frame`` and freeze it.

        Returns False if there is no reliable mapping to freeze.
        """

        with self._mapping_lock:
            result = mapping_result
            if result is None and frame is not None:
                result = self.mapper.map_frame(frame)
            if result is None:
                result = self._last_mapping
            if result is None or not result.ok:
                return False
            self._frozen_mapping = result
            self._last_mapping = result
            return True

    def unfreeze_mapping(self) -> None:
        """Return to live per-frame keyboard mapping."""

        with self._mapping_lock:
            self._frozen_mapping = None

    def current_mapping(self) -> Optional[KeyboardMappingResult]:
        """Return the frozen map if present, otherwise the latest good map."""

        with self._mapping_lock:
            return self._frozen_mapping or self._last_mapping

    def analyze(
        self,
        event: KeyEvent,
        snapshot: Optional[FrameSnapshot],
        frame_delta_ms: Optional[float] = None,
        fingers: Optional[Iterable[FingerPoint]] = None,
        mapping_result: Optional[KeyboardMappingResult] = None,
    ) -> PressAnalysis:
        started_ns = time.perf_counter_ns()
        if snapshot is None:
            return PressAnalysis(
                ok=False,
                key_event=event,
                frame_delta_ms=frame_delta_ms,
                error="no_frame_available",
            )

        if fingers is None:
            if snapshot.fingers:
                finger_points = list(snapshot.fingers)
            elif self.finger_tracker is not None:
                finger_points = self.finger_tracker.detect(snapshot.frame)
            else:
                finger_points = []
        else:
            finger_points = list(fingers)

        with self._mapping_lock:
            if mapping_result is None:
                mapping_result = self._frozen_mapping
            if mapping_result is None:
                mapping_result = self.mapper.map_frame(snapshot.frame)
                if mapping_result.ok:
                    self._last_mapping = mapping_result

        if not mapping_result.ok:
            return PressAnalysis(
                ok=False,
                key_event=event,
                frame_sequence=snapshot.sequence,
                frame_delta_ms=frame_delta_ms,
                keyboard_ok=False,
                keyboard_reason=mapping_result.reason,
                latency={"analysis_ms": _elapsed_ms(started_ns)},
                error="keyboard_mapping_failed",
            )

        pressed_key = normalize_key_name(event.key, code=event.code, location=event.location)
        finger_rows = self._finger_key_rows(finger_points, mapping_result.keys, pressed_key)
        pressed_finger = self._choose_pressed_finger(finger_rows)
        keyboard = mapping_result.to_jsonable()
        keyboard["size"] = [snapshot.width, snapshot.height]
        keyboard["mode"] = "frozen" if self.frozen else "live"

        return PressAnalysis(
            ok=pressed_finger is not None,
            key_event=event,
            frame_sequence=snapshot.sequence,
            frame_delta_ms=frame_delta_ms,
            keyboard_ok=True,
            keyboard_reason=None,
            pressed_key=pressed_key,
            pressed_finger=pressed_finger,
            finger_keys=finger_rows,
            keyboard=keyboard,
            latency={"analysis_ms": _elapsed_ms(started_ns)},
            error=None if pressed_finger else "no_fingertip_for_pressed_key",
        )

    def _finger_key_rows(
        self,
        fingers: Iterable[FingerPoint],
        key_polygons: Dict[str, np.ndarray],
        pressed_key: str,
    ) -> List[Dict]:
        rows: List[Dict] = []
        target_poly = _find_key_polygon(key_polygons, pressed_key)
        for point in fingers:
            hit_key = _key_at(point.x, point.y, key_polygons)
            distance = _distance_to_polygon_center(point.x, point.y, target_poly)
            rows.append(
                {
                    **point.to_jsonable(),
                    "key": hit_key,
                    "matches_pressed_key": _same_key(hit_key, pressed_key),
                    "distance_to_pressed_key_center": distance,
                }
            )
        rows.sort(
            key=lambda row: (
                not bool(row["matches_pressed_key"]),
                math.inf if row["distance_to_pressed_key_center"] is None else row["distance_to_pressed_key_center"],
            )
        )
        return rows

    @staticmethod
    def _choose_pressed_finger(rows: List[Dict]) -> Optional[Dict]:
        if not rows:
            return None
        for row in rows:
            if row["matches_pressed_key"]:
                return row
        return rows[0]


def _key_at(x: float, y: float, key_polygons: Dict[str, np.ndarray]) -> Optional[str]:
    from identify_key import identify_key

    return identify_key(x, y, key_polygons)


def _find_key_polygon(key_polygons: Dict[str, np.ndarray], key: str) -> Optional[np.ndarray]:
    for name, polygon in key_polygons.items():
        if _same_key(name, key):
            return polygon
    return None


def _same_key(left: Optional[str], right: Optional[str]) -> bool:
    if left is None or right is None:
        return False
    return str(left).strip().lower() == str(right).strip().lower()


def _distance_to_polygon_center(x: float, y: float, polygon: Optional[np.ndarray]) -> Optional[float]:
    if polygon is None:
        return None
    center = np.asarray(polygon, dtype=np.float32).mean(axis=0)
    return float(np.hypot(center[0] - x, center[1] - y))


def _elapsed_ms(started_ns: int) -> float:
    return (time.perf_counter_ns() - started_ns) / 1_000_000
