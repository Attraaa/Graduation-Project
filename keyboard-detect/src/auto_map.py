"""
Phase 3: Map every key polygon from perfect_map onto a real photo
by detecting 4 corner keys with a custom-trained YOLO model.

Pipeline:
  1. YOLO (trained on 4 corner classes) -> get center (cx,cy) of each
     corner: tilde / backspace / lctrl / rctrl
  2. Compute cv2.getPerspectiveTransform from master corners (in
     perfect_map.json) to detected photo corners
  3. cv2.perspectiveTransform every key polygon
"""

import argparse
import json
import os
from typing import Dict, Tuple

import cv2
import numpy as np


# Tolerant class-name matching: a YOLO model may use any of these names.
CORNER_ALIASES = {
    "tilde":     {"tilde", "~", "grave", "backtick", "tilda"},
    "backspace": {"backspace", "back", "bksp", "bsp"},
    "lctrl":     {"lctrl", "l-ctrl", "leftctrl", "left_ctrl", "ctrl_l", "lctl"},
    "rctrl":     {"rctrl", "r-ctrl", "rightctrl", "right_ctrl", "ctrl_r", "rctl"},
}

# Names in perfect_map.json that correspond to each corner.
PERFECT_MAP_NAMES = {
    "tilde":     ["~", "`", "Tilde"],
    "backspace": ["Backspace", "BackSpace"],
    "lctrl":     ["L-Ctrl", "LCtrl", "LeftCtrl"],
    "rctrl":     ["R-Ctrl", "RCtrl", "RightCtrl"],
}


def load_perfect_map(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def polygon_center(polygon) -> Tuple[float, float]:
    arr = np.array(polygon, dtype=np.float32)
    return (float(arr[:, 0].mean()), float(arr[:, 1].mean()))


def corner_in_perfect_map(perfect_map: dict, corner: str) -> Tuple[float, float]:
    keys = perfect_map["keys"]
    for n in PERFECT_MAP_NAMES[corner]:
        if n in keys:
            return polygon_center(keys[n])
    raise KeyError(f"perfect_map missing {corner}; tried {PERFECT_MAP_NAMES[corner]}")


def normalize_class_name(name: str) -> str:
    """Map a YOLO class name to one of the 4 canonical corner labels, or ''."""
    n = name.lower().replace(" ", "").replace("-", "").replace("_", "")
    for canonical, aliases in CORNER_ALIASES.items():
        for a in aliases:
            an = a.lower().replace(" ", "").replace("-", "").replace("_", "")
            if n == an:
                return canonical
    return ""


def enhance_for_detection(image: np.ndarray) -> np.ndarray:
    """Fast contrast/detail normalization for difficult webcam frames.

    The image size is unchanged, so detected coordinates still map directly to
    the original frame. This is intentionally conservative: enough to help dark
    or washed-out tilde/backspace text, not enough to invent strong artifacts.
    """
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    enhanced = cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)
    blur = cv2.GaussianBlur(enhanced, (0, 0), 1.0)
    return cv2.addWeighted(enhanced, 1.25, blur, -0.25, 0)


def merge_corner_detections(*detections) -> Dict[str, Tuple[float, float, float]]:
    best: Dict[str, Tuple[float, float, float]] = {}
    for det in detections:
        for key, value in det.items():
            if key not in best or value[2] > best[key][2]:
                best[key] = value
    return best


def detect_corners_robust(model, image: np.ndarray, conf: float = 0.1,
                          tta: bool = False, imgsz: int = None,
                          enhance: str = "auto",
                          min_good_conf: float = 0.28
                          ) -> Tuple[Dict[str, Tuple[float, float, float]], dict]:
    """Fast-path original frame, then fallback to enhanced frame if needed."""
    raw = detect_corners_raw(model, image, conf=conf, tta=tta, imgsz=imgsz)
    required = set(CORNER_ALIASES)
    complete = required <= set(raw)
    min_conf = min((v[2] for v in raw.values()), default=0.0)

    used = ["original"]
    if enhance == "off" or (enhance == "auto" and complete and min_conf >= min_good_conf):
        return raw, {"passes": used, "min_conf": min_conf}

    enhanced = enhance_for_detection(image)
    enhanced_raw = detect_corners_raw(model, enhanced, conf=conf, tta=tta, imgsz=imgsz)
    used.append("enhanced")
    merged = merge_corner_detections(raw, enhanced_raw)
    return merged, {
        "passes": used,
        "min_conf": min((v[2] for v in merged.values()), default=0.0),
    }


def detect_corners(model, image: np.ndarray, conf: float = 0.1
                   ) -> Dict[str, Tuple[float, float]]:
    """Run YOLO and return one (cx,cy) per corner class (highest confidence).
    Raises if any of the 4 corners is missing."""
    raw = detect_corners_raw(model, image, conf)
    missing = set(CORNER_ALIASES) - set(raw)
    if missing:
        raise RuntimeError(
            f"YOLO failed to detect corner(s): {sorted(missing)}. Found: {sorted(raw)}"
        )
    return {k: (v[0], v[1]) for k, v in raw.items()}


def detect_corners_raw(model, image: np.ndarray, conf: float = 0.1,
                       tta: bool = False, imgsz: int = None
                       ) -> Dict[str, Tuple[float, float, float]]:
    """Detect whatever corners are visible. Returns canonical -> (cx, cy, conf).
    Set tta=True for multi-scale/flip Test-Time Augmentation (slower, more accurate)."""
    kw = {"verbose": False, "conf": conf, "augment": tta}
    if imgsz:
        kw["imgsz"] = imgsz
    results = model(image, **kw)[0]
    if results.boxes is None:
        return {}
    names = results.names
    best: Dict[str, Tuple[float, float, float]] = {}
    for box in results.boxes:
        cls_idx = int(box.cls.item())
        c = float(box.conf.item())
        canon = normalize_class_name(names[cls_idx])
        if not canon:
            continue
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
        if canon not in best or c > best[canon][2]:
            best[canon] = (cx, cy, c)
    return best


def compute_transform(perfect_map: dict, dst: Dict[str, Tuple[float, float]]) -> np.ndarray:
    src_pts = np.float32([
        corner_in_perfect_map(perfect_map, "tilde"),
        corner_in_perfect_map(perfect_map, "backspace"),
        corner_in_perfect_map(perfect_map, "lctrl"),
        corner_in_perfect_map(perfect_map, "rctrl"),
    ])
    dst_pts = np.float32([dst["tilde"], dst["backspace"],
                          dst["lctrl"], dst["rctrl"]])
    return cv2.getPerspectiveTransform(src_pts, dst_pts)


def transform_all_keys(perfect_map: dict, M: np.ndarray) -> Dict[str, np.ndarray]:
    out: Dict[str, np.ndarray] = {}
    for name, polygon in perfect_map["keys"].items():
        pts = np.array(polygon, dtype=np.float32).reshape(-1, 1, 2)
        out[name] = cv2.perspectiveTransform(pts, M).reshape(-1, 2)
    return out


def auto_map(image_path: str,
             model_path: str = "models/best.pt",
             perfect_map_path: str = "data/perfect_map.json"
             ) -> Tuple[np.ndarray, Dict[str, np.ndarray], dict]:
    from ultralytics import YOLO

    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(image_path)
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"{model_path} not found. Train it first via: python src/train_yolo.py"
        )

    model = YOLO(model_path)
    raw, det_info = detect_corners_robust(model, img, conf=0.1, imgsz=960)
    missing = set(CORNER_ALIASES) - set(raw)
    if missing:
        raise RuntimeError(
            f"YOLO failed to detect corner(s): {sorted(missing)}. Found: {sorted(raw)}"
        )
    corners = {k: (v[0], v[1]) for k, v in raw.items()}

    perfect = load_perfect_map(perfect_map_path)
    M = compute_transform(perfect, corners)

    info = {
        "corners": {k: list(v) for k, v in corners.items()},
        "detection": det_info,
        "model_classes": model.names,
    }
    return img, transform_all_keys(perfect, M), info


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True)
    ap.add_argument("--model", default="models/best.pt")
    ap.add_argument("--map", default="data/perfect_map.json")
    args = ap.parse_args()

    img, result_map, info = auto_map(args.image, args.model, args.map)
    print(f"mapped {len(result_map)} keys onto {os.path.basename(args.image)}")
    print(f"  detected corners: {info['corners']}")
