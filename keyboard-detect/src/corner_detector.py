"""Keyboard corner detection with ONNX Runtime (models/best.onnx).

best.onnx is models/best.pt exported by scripts/export_onnx.py. This module repeats what
Ultralytics did when the analyzer ran best.pt, so the corners match without PyTorch:

1. Letterbox to `imgsz`: keep the aspect ratio, pad (value 114, centered) only up to a
   multiple of the model stride, BGR -> RGB, scale to 0-1.
2. Give each anchor its best class and keep anchors whose score beats `conf`.
3. Map boxes back to frame pixels and clip them to the frame.

The mapper uses only the most confident box of each corner class. Non-maximum suppression
always keeps the top box of a class, so it is skipped here.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import cv2
import numpy as np
import onnxruntime as ort


@dataclass(frozen=True)
class Detection:
    """A class name, its confidence and the (x1, y1, x2, y2) box in frame pixels."""

    name: str
    conf: float
    box: Tuple[float, float, float, float]


def letterbox(frame: np.ndarray, imgsz: int, stride: int) -> np.ndarray:
    """Resize and pad like Ultralytics' predict-time LetterBox (minimum rectangle, centered)."""
    h, w = frame.shape[:2]
    r = min(imgsz / h, imgsz / w)
    new_w, new_h = round(w * r), round(h * r)
    dw, dh = (imgsz - new_w) % stride / 2, (imgsz - new_h) % stride / 2
    if (w, h) != (new_w, new_h):
        frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    return cv2.copyMakeBorder(frame, round(dh - 0.1), round(dh + 0.1), round(dw - 0.1), round(dw + 0.1),
                              cv2.BORDER_CONSTANT, value=(114, 114, 114))


def scale_boxes(boxes: np.ndarray, input_shape, frame_shape) -> np.ndarray:
    """Map xyxy boxes from the letterboxed input back to the frame and clip, like Ultralytics."""
    gain = min(input_shape[0] / frame_shape[0], input_shape[1] / frame_shape[1])
    pad_x = round((input_shape[1] - round(frame_shape[1] * gain)) / 2 - 0.1)
    pad_y = round((input_shape[0] - round(frame_shape[0] * gain)) / 2 - 0.1)
    boxes = (boxes - np.array([pad_x, pad_y, pad_x, pad_y], dtype=boxes.dtype)) / gain
    boxes[:, [0, 2]] = boxes[:, [0, 2]].clip(0, frame_shape[1])
    boxes[:, [1, 3]] = boxes[:, [1, 3]].clip(0, frame_shape[0])
    return boxes


def top_box_per_class(output: np.ndarray, conf: float) -> Dict[int, Tuple[np.ndarray, float]]:
    """From raw (1, 4 + classes, anchors) output: class id -> (xyxy box, score) of its best anchor.

    An anchor counts only for its highest-scoring class and only when that score is above `conf`,
    the same candidates Ultralytics passes to NMS.
    """
    pred = output[0].T
    scores = pred[:, 4:]
    classes = scores.argmax(1)
    best = scores[np.arange(len(pred)), classes]
    top: Dict[int, Tuple[np.ndarray, float]] = {}
    for cls in np.unique(classes[best > conf]):
        candidates = np.flatnonzero((classes == cls) & (best > conf))
        i = candidates[best[candidates].argmax()]
        cx, cy, w, h = pred[i, :4]
        top[int(cls)] = (np.array([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], dtype=pred.dtype), float(best[i]))
    return top


class OnnxCornerDetector:
    """Runs best.onnx on BGR frames."""

    def __init__(self, model_path: str, imgsz: int = 800):
        options = ort.SessionOptions()
        # Mapping runs now and then next to MediaPipe; idle worker threads should not spin on the CPU.
        options.add_session_config_entry("session.intra_op.allow_spinning", "0")
        self.session = ort.InferenceSession(str(model_path), sess_options=options, providers=["CPUExecutionProvider"])
        metadata = self.session.get_modelmeta().custom_metadata_map
        self.metadata = dict(metadata)
        self.names: Dict[int, str] = {int(k): str(v) for k, v in ast.literal_eval(metadata["names"]).items()}
        self.stride = int(metadata.get("stride", 32))
        self.imgsz = imgsz
        self._input = self.session.get_inputs()[0].name

    def best_per_class(self, frame: np.ndarray, conf: float = 0.25, imgsz: Optional[int] = None) -> Dict[str, Detection]:
        """Class name -> its most confident detection above `conf` (scores must be strictly greater)."""
        image = letterbox(frame, imgsz or self.imgsz, self.stride)
        tensor = np.ascontiguousarray(image[..., ::-1].transpose(2, 0, 1)[None], dtype=np.float32) / 255
        output = self.session.run(None, {self._input: tensor})[0]
        top = top_box_per_class(output, conf)
        if not top:
            return {}
        boxes = scale_boxes(np.stack([box for box, _ in top.values()]), image.shape[:2], frame.shape[:2])
        return {
            self.names[cls]: Detection(self.names[cls], score, tuple(float(v) for v in box))
            for (cls, (_, score)), box in zip(top.items(), boxes)
        }
