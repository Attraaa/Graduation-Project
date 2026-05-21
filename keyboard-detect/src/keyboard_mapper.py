"""
Reusable keyboard coordinate mapper.

This module is the part intended to be imported by another program.
It does not depend on the demo web app.

Default behavior is stateless: every call uses only the current frame. This is
important when frames arrive occasionally, not as a continuous video stream.
If you explicitly want video smoothing, pass temporal=True.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from auto_map import (
    CORNER_ALIASES,
    compute_transform,
    detect_corners_robust,
    load_perfect_map,
    transform_all_keys,
)
from identify_key import identify_key


Point = Tuple[float, float]
KeyPolygons = Dict[str, np.ndarray]
CornerDetections = Dict[str, Tuple[float, float, float]]


CORNER_ORDER = ("tilde", "backspace", "lctrl", "rctrl")


@dataclass
class KeyboardMappingResult:
    """Result from one frame.

    Attributes:
        ok: True only when key polygons are reliable enough to use.
        state: "mapped", "tracked", or "failed".
        reason: Failure or warning reason. None when cleanly mapped.
        keys: key name -> 4-point polygon in the input image coordinate space.
        corners: canonical corner name -> point used for homography.
        detections: raw YOLO detections with confidence.
        missing: corner classes not detected in the current frame.
        quality: geometry/confidence metrics used by validation.
    """

    ok: bool
    state: str
    reason: Optional[str]
    keys: KeyPolygons = field(default_factory=dict)
    corners: Dict[str, Point] = field(default_factory=dict)
    detections: Dict[str, Dict[str, float]] = field(default_factory=dict)
    missing: List[str] = field(default_factory=list)
    quality: Dict[str, float] = field(default_factory=dict)
    detection_info: Dict = field(default_factory=dict)

    def key_at(self, x: float, y: float) -> Optional[str]:
        """Return the key at image coordinate (x, y), or None."""
        if not self.ok:
            return None
        return identify_key(x, y, self.keys)

    def to_jsonable(self) -> dict:
        """Convert result to JSON-friendly Python data."""
        return {
            "ok": self.ok,
            "state": self.state,
            "reason": self.reason,
            "keys": {name: poly.tolist() for name, poly in self.keys.items()},
            "corners": {k: {"x": v[0], "y": v[1]} for k, v in self.corners.items()},
            "detections": self.detections,
            "missing": self.missing,
            "quality": self.quality,
            "detection_info": self.detection_info,
        }


class KeyboardCoordinateMapper:
    """Map image coordinates to physical keyboard keys.

    Typical flow:
        mapper = KeyboardCoordinateMapper()
        result = mapper.map_frame(frame)
        key = result.key_at(finger_x, finger_y)

    The default mode is intentionally stateless. A bad frame returns ok=False
    instead of reusing an old map that may not match the current image.
    """

    def __init__(
        self,
        model_path: str = "models/best.pt",
        perfect_map_path: str = "data/perfect_map.json",
        imgsz: int = 800,
        conf: float = 0.1,
        tta: bool = False,
        enhance: str = "auto",
        min_confidence: float = 0.18,
        min_area_ratio: float = 0.015,
        min_in_frame_ratio: float = 0.75,
        min_aspect_ratio: float = 1.15,
        temporal: bool = False,
        smoothing: float = 0.25,
        max_temporal_jump_ratio: float = 0.18,
    ):
        if not os.path.exists(model_path):
            raise FileNotFoundError(model_path)
        if not os.path.exists(perfect_map_path):
            raise FileNotFoundError(perfect_map_path)

        from ultralytics import YOLO

        self.model = YOLO(model_path)
        self.perfect_map = load_perfect_map(perfect_map_path)

        self.imgsz = imgsz
        self.conf = conf
        self.tta = tta
        self.enhance = enhance
        self.min_confidence = min_confidence
        self.min_area_ratio = min_area_ratio
        self.min_in_frame_ratio = min_in_frame_ratio
        self.min_aspect_ratio = min_aspect_ratio

        # Optional video smoothing. Disabled by default for single-frame use.
        self.temporal = temporal
        self.smoothing = smoothing
        self.max_temporal_jump_ratio = max_temporal_jump_ratio
        self._last_corners: Optional[Dict[str, Point]] = None
        self._last_result: Optional[KeyboardMappingResult] = None

    def reset(self) -> None:
        """Forget optional temporal state."""
        self._last_corners = None
        self._last_result = None

    def map_image(self, image_path: str) -> KeyboardMappingResult:
        """Load image_path and map its keyboard keys."""
        frame = cv2.imread(image_path)
        if frame is None:
            raise FileNotFoundError(image_path)
        return self.map_frame(frame)

    def map_frame(self, frame: np.ndarray) -> KeyboardMappingResult:
        """Map one BGR frame.

        This is the main method for integration. It returns ok=False when the
        frame cannot be trusted, instead of returning unstable polygons.
        """
        raw, det_info = detect_corners_robust(
            self.model,
            frame,
            conf=self.conf,
            tta=self.tta,
            imgsz=self.imgsz,
            enhance=self.enhance,
        )
        detections = self._format_detections(raw)
        missing = sorted(set(CORNER_ALIASES) - set(raw))

        if missing:
            return KeyboardMappingResult(
                ok=False,
                state="failed",
                reason="missing_corners",
                detections=detections,
                missing=missing,
                detection_info=det_info,
            )

        corners = {k: (raw[k][0], raw[k][1]) for k in CORNER_ORDER}
        corners = self._apply_temporal_smoothing(corners, frame.shape)
        M = compute_transform(self.perfect_map, corners)
        keys = transform_all_keys(self.perfect_map, M)
        quality = self._quality_metrics(frame.shape, corners, keys, raw)

        ok, reason = self._validate_quality(quality)
        if not ok:
            return KeyboardMappingResult(
                ok=False,
                state="failed",
                reason=reason,
                detections=detections,
                missing=missing,
                quality=quality,
                detection_info=det_info,
            )

        result = KeyboardMappingResult(
            ok=True,
            state="tracked" if self.temporal and self._last_corners is not None else "mapped",
            reason=None,
            keys=keys,
            corners=corners,
            detections=detections,
            missing=missing,
            quality=quality,
            detection_info=det_info,
        )

        if self.temporal:
            self._last_corners = corners
            self._last_result = result

        return result

    # Backward-compatible alias for older demo code.
    def process_frame(self, frame: np.ndarray) -> dict:
        """Return map_frame(frame).to_jsonable() for JSON-style callers."""
        return self.map_frame(frame).to_jsonable()

    def key_at(self, x: float, y: float, result: Optional[KeyboardMappingResult] = None) -> Optional[str]:
        """Return key at (x, y).

        Pass the result returned by map_frame for stateless use. If omitted,
        this uses the last result only when temporal=True has produced one.
        """
        if result is not None:
            return result.key_at(x, y)
        if self._last_result is not None:
            return self._last_result.key_at(x, y)
        return None

    def draw_overlay(self, frame: np.ndarray, result: KeyboardMappingResult) -> np.ndarray:
        """Draw detected key polygons for visual debugging."""
        canvas = frame.copy()
        if result.ok:
            for name, poly in result.keys.items():
                pts = np.asarray(poly, dtype=np.int32)
                cv2.polylines(canvas, [pts], True, (60, 255, 120), 2)
                cx, cy = pts.mean(axis=0).astype(int)
                cv2.putText(canvas, name, (cx - 12, cy + 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 0), 3, cv2.LINE_AA)
                cv2.putText(canvas, name, (cx - 12, cy + 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 0), 1, cv2.LINE_AA)

        for label, det in result.detections.items():
            x, y, c = det["x"], det["y"], det["conf"]
            cv2.circle(canvas, (int(x), int(y)), 9, (0, 0, 255), 2)
            cv2.putText(canvas, f"{label} {c:.2f}", (int(x) + 10, int(y)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2, cv2.LINE_AA)
        return canvas

    def _apply_temporal_smoothing(self, corners: Dict[str, Point], shape) -> Dict[str, Point]:
        if not self.temporal or self._last_corners is None:
            return corners

        h, w = shape[:2]
        diag = float(np.hypot(w, h))
        jumps = [
            float(np.hypot(corners[k][0] - self._last_corners[k][0],
                           corners[k][1] - self._last_corners[k][1]))
            for k in CORNER_ORDER
        ]
        if max(jumps) > diag * self.max_temporal_jump_ratio:
            # Do not silently hold old data. For module use, a large jump is a
            # new state that should be validated from the frame itself.
            return corners

        a = self.smoothing
        return {
            k: (
                self._last_corners[k][0] * (1 - a) + corners[k][0] * a,
                self._last_corners[k][1] * (1 - a) + corners[k][1] * a,
            )
            for k in CORNER_ORDER
        }

    def _quality_metrics(self, shape, corners, keys, raw) -> Dict[str, float]:
        h, w = shape[:2]
        quad = np.array([
            corners["tilde"],
            corners["backspace"],
            corners["rctrl"],
            corners["lctrl"],
        ], dtype=np.float32)

        area_ratio = abs(float(cv2.contourArea(quad))) / float(w * h)
        top = np.linalg.norm(quad[1] - quad[0])
        bottom = np.linalg.norm(quad[2] - quad[3])
        left = np.linalg.norm(quad[3] - quad[0])
        right = np.linalg.norm(quad[2] - quad[1])
        aspect = float((top + bottom) / max(left + right, 1e-6))

        centers_inside = 0
        for poly in keys.values():
            cx, cy = np.asarray(poly, dtype=np.float32).mean(axis=0)
            if 0 <= cx < w and 0 <= cy < h:
                centers_inside += 1
        in_frame_ratio = centers_inside / max(len(keys), 1)

        return {
            "min_confidence": min(float(raw[k][2]) for k in CORNER_ORDER),
            "area_ratio": area_ratio,
            "aspect_ratio": aspect,
            "in_frame_ratio": in_frame_ratio,
            "convex": 1.0 if cv2.isContourConvex(quad.astype(np.int32)) else 0.0,
        }

    def _validate_quality(self, q: Dict[str, float]) -> Tuple[bool, Optional[str]]:
        if q["min_confidence"] < self.min_confidence:
            return False, "low_confidence"
        if q["convex"] < 0.5:
            return False, "invalid_corner_geometry"
        if q["area_ratio"] < self.min_area_ratio:
            return False, "keyboard_too_small_or_bad_geometry"
        if q["aspect_ratio"] < self.min_aspect_ratio:
            return False, "bad_keyboard_aspect"
        if q["in_frame_ratio"] < self.min_in_frame_ratio:
            return False, "mapped_keys_out_of_frame"
        return True, None

    @staticmethod
    def _format_detections(raw: CornerDetections) -> Dict[str, Dict[str, float]]:
        return {
            k: {"x": float(v[0]), "y": float(v[1]), "conf": float(v[2])}
            for k, v in raw.items()
        }
