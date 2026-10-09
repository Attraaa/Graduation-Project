"""MediaPipe fingertip detector used by the test server and integrations."""

from __future__ import annotations

import threading
import math
from typing import List, Optional

import cv2

from .events import FingerPoint


TIP_LANDMARKS = {
    4: "thumb",
    8: "index",
    12: "middle",
    16: "ring",
    20: "pinky",
}


class MediaPipeFingerTracker:
    """Small wrapper around MediaPipe Hands.

    The import is lazy so the rest of the keylog package can be used without
    MediaPipe installed.
    """

    def __init__(
        self,
        max_num_hands: int = 2,
        min_detection_confidence: float = 0.45,
        min_tracking_confidence: float = 0.45,
        input_is_mirrored: bool = False,
    ):
        try:
            import mediapipe as mp
        except ImportError as exc:
            raise RuntimeError(
                "mediapipe is required for fingertip tracking. "
                "Install it with: pip install mediapipe"
            ) from exc

        self._mp_hands = mp.solutions.hands
        self._hands = self._mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=max_num_hands,
            model_complexity=0,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )
        self._lock = threading.Lock()
        self._input_is_mirrored = input_is_mirrored

    def close(self) -> None:
        with self._lock:
            self._hands.close()

    def detect(self, frame_bgr, input_is_mirrored: Optional[bool] = None) -> List[FingerPoint]:
        h, w = frame_bgr.shape[:2]
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        with self._lock:
            result = self._hands.process(rgb)

        if not result.multi_hand_landmarks:
            return []

        handedness = result.multi_handedness or []
        points: List[FingerPoint] = []
        for hand_index, landmarks in enumerate(result.multi_hand_landmarks):
            hand_label = _hand_label(handedness, hand_index)
            # MediaPipe Hands labels assume a mirrored selfie image. Browser
            # camera frames are sent unmirrored so the physical labels swap.
            mirrored = self._input_is_mirrored if input_is_mirrored is None else input_is_mirrored
            if not mirrored:
                hand_label = {"Left": "Right", "Right": "Left"}.get(hand_label, hand_label)
            for landmark_id, finger_name in TIP_LANDMARKS.items():
                lm = landmarks.landmark[landmark_id]
                if not (math.isfinite(lm.x) and math.isfinite(lm.y) and 0 <= lm.x <= 1 and 0 <= lm.y <= 1):
                    continue
                points.append(
                    FingerPoint(
                        hand=hand_label,
                        finger=finger_name,
                        x=float(lm.x * w),
                        y=float(lm.y * h),
                        # Hands does not supply calibrated fingertip visibility.
                        # This score describes hand-label quality, not occlusion.
                        score=_hand_score(handedness, hand_index),
                        landmark_id=landmark_id,
                    )
                )
        return points


def _hand_label(handedness, index: int) -> str:
    try:
        return str(handedness[index].classification[0].label)
    except Exception:
        return f"hand_{index}"

def _hand_score(handedness, index: int) -> float:
    try:
        score = float(handedness[index].classification[0].score)
        return score if math.isfinite(score) and 0 <= score <= 1 else 0.0
    except (IndexError, AttributeError, TypeError, ValueError):
        return 0.0
