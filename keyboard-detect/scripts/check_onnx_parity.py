"""Check that models/best.onnx maps keyboards exactly like models/best.pt did.

Run from keyboard-detect with the model tools and a Roboflow YOLOv8 export:
    uv run --locked --managed-python --group model python scripts/check_onnx_parity.py [dataset]

The default dataset is datasets/keyboard-60-detect-3 (git-ignored; Roboflow project
keyboard-60-detect, version 3). Every image goes through the analyzer's own path
(KeyboardCoordinateMapper.map_frame, enhancement fallback included) as exported and resized
to 16:9 and 4:3 frames, once with best.onnx and once with best.pt through Ultralytics predict
(NMS included), the way the analyzer ran it before. Exits 1 when any result differs.
"""
from __future__ import annotations

import argparse
import os
import statistics
import sys
import time
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from auto_map import normalize_class_name  # noqa: E402
from corner_detector import Detection  # noqa: E402
from keyboard_mapper import KeyboardCoordinateMapper  # noqa: E402

SIZES = {"as exported": None, "960x540": (960, 540), "640x480": (640, 480)}
MAX_CORNER_PX, MAX_CONF, MAX_KEY_PX = 1.0, 0.01, 2.0


class UltralyticsReference:
    """The previous detection path: best.pt through Ultralytics predict."""

    def __init__(self, weights: Path):
        from ultralytics import YOLO

        self.model = YOLO(str(weights))

    def best_per_class(self, frame, conf=0.25, imgsz=None):
        kwargs = {"verbose": False, "conf": conf, "augment": False}
        if imgsz:
            kwargs["imgsz"] = imgsz
        result = self.model(frame, **kwargs)[0]
        best = {}
        for box in result.boxes:
            name, score = result.names[int(box.cls.item())], float(box.conf.item())
            if name not in best or score > best[name].conf:
                best[name] = Detection(name, score, tuple(box.xyxy[0].tolist()))
        return best


def labeled_corners(label_file: Path, names, width, height):
    """canonical corner -> labeled (x1, y1, x2, y2) box in pixels."""
    boxes = {}
    for line in label_file.read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if len(parts) != 5:
            continue
        cls, cx, cy, w, h = int(parts[0]), *map(float, parts[1:])
        boxes[normalize_class_name(names[cls])] = ((cx - w / 2) * width, (cy - h / 2) * height,
                                                   (cx + w / 2) * width, (cy + h / 2) * height)
    return boxes


def hits(result, truth):
    found = 0
    for corner, (x1, y1, x2, y2) in truth.items():
        point = result.detections.get(corner)
        found += bool(point and x1 <= point["x"] <= x2 and y1 <= point["y"] <= y2)
    return found


def timed(mapper, model, frame):
    mapper.model = model
    start = time.perf_counter()
    result = mapper.map_frame(frame)
    return result, (time.perf_counter() - start) * 1000


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("dataset", nargs="?", type=Path, default=ROOT / "datasets" / "keyboard-60-detect-3")
    parser.add_argument("--splits", default="valid,test,train")
    args = parser.parse_args(argv)

    os.environ.setdefault("YOLO_AUTOINSTALL", "false")
    os.environ.setdefault("YOLO_OFFLINE", "1")
    import yaml

    names = yaml.safe_load((args.dataset / "data.yaml").read_text(encoding="utf-8"))["names"]
    mapper = KeyboardCoordinateMapper(model_path=str(ROOT / "models" / "best.onnx"),
                                      perfect_map_path=str(ROOT / "data" / "perfect_map.json"))
    onnx_model, reference = mapper.model, UltralyticsReference(ROOT / "models" / "best.pt")

    frames = mismatches = 0
    corner_px = conf_diff = key_px = 0.0
    times = {"pt": [], "onnx": []}
    hit_counts = {}
    for split in args.splits.split(","):
        for image_file in sorted((args.dataset / split / "images").iterdir()):
            image = cv2.imread(str(image_file))
            label_file = args.dataset / split / "labels" / f"{image_file.stem}.txt"
            for size_name, size in SIZES.items():
                frame = image if size is None else cv2.resize(image, size, interpolation=cv2.INTER_AREA)
                new, new_ms = timed(mapper, onnx_model, frame)
                old, old_ms = timed(mapper, reference, frame)
                times["onnx"].append(new_ms)
                times["pt"].append(old_ms)
                frames += 1

                same = (set(new.detections) == set(old.detections) and (new.ok, new.reason) == (old.ok, old.reason)
                        and new.detection_info.get("passes") == old.detection_info.get("passes"))
                for corner in set(new.detections) & set(old.detections):
                    a, b = new.detections[corner], old.detections[corner]
                    corner_px = max(corner_px, abs(a["x"] - b["x"]), abs(a["y"] - b["y"]))
                    conf_diff = max(conf_diff, abs(a["conf"] - b["conf"]))
                if new.ok and old.ok:
                    key_px = max(key_px, max(float(np.abs(new.keys[k] - old.keys[k]).max()) for k in new.keys))
                if not same:
                    mismatches += 1
                    print(f"DIFFERENT {split}/{image_file.name} [{size_name}]: onnx {new.ok}/{new.reason}/"
                          f"{sorted(new.detections)} vs pt {old.ok}/{old.reason}/{sorted(old.detections)}")

                if label_file.exists():
                    truth = labeled_corners(label_file, names, frame.shape[1], frame.shape[0])
                    group = "held-out (valid+test)" if split in {"valid", "test"} else split
                    counts = hit_counts.setdefault(group, {"labels": 0, "pt": 0, "onnx": 0, "mapped_pt": 0,
                                                           "mapped_onnx": 0, "frames": 0})
                    counts["labels"] += len(truth)
                    counts["pt"] += hits(old, truth)
                    counts["onnx"] += hits(new, truth)
                    counts["mapped_pt"] += old.ok
                    counts["mapped_onnx"] += new.ok
                    counts["frames"] += 1

    print(f"frames: {frames} ({', '.join(SIZES)})")
    print(f"same corners, mapping result and passes: {frames - mismatches}/{frames}")
    print(f"max difference: corner {corner_px:.4f} px, confidence {conf_diff:.6f}, key polygon {key_px:.4f} px")
    for group, c in hit_counts.items():
        print(f"{group}: corner inside labeled box pt {c['pt']}/{c['labels']}, onnx {c['onnx']}/{c['labels']}; "
              f"keyboard mapped pt {c['mapped_pt']}/{c['frames']}, onnx {c['mapped_onnx']}/{c['frames']}")
    print(f"map_frame median: pt {statistics.median(times['pt']):.0f} ms, onnx {statistics.median(times['onnx']):.0f} ms")
    failed = mismatches or corner_px > MAX_CORNER_PX or conf_diff > MAX_CONF or key_px > MAX_KEY_PX
    print("FAIL" if failed else "PASS")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
