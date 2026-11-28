"""Check runtime imports and bundled resources without opening cameras or capturing keys."""
from pathlib import Path
import json
import platform
import sys

import cv2
import mediapipe as mp
import numpy as np
import onnxruntime as ort

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "src"))
from corner_detector import OnnxCornerDetector  # noqa: E402

toolchain = json.loads((root.parent / "toolchain.json").read_text(encoding="utf-8"))
if platform.python_version() != toolchain["python"]:
    raise RuntimeError("Python version differs from toolchain.json; run setup.cmd.")
if not hasattr(mp, "solutions"):
    raise RuntimeError("This implementation requires MediaPipe's legacy solutions API.")
detector = OnnxCornerDetector(str(root / "models" / "best.onnx"))
detector.best_per_class(np.zeros((480, 640, 3), dtype=np.uint8), conf=0.1)  # one real inference
key_map = json.loads((root / "data" / "perfect_map.json").read_text(encoding="utf-8"))
if not key_map:
    raise RuntimeError("The keyboard map is empty.")
print(f"Python {platform.python_version()} ({sys.executable})")
print(f"OpenCV {cv2.__version__}, NumPy {np.__version__}, MediaPipe {mp.__version__}, ONNX Runtime {ort.__version__}")
print(f"Keyboard model loaded: {len(detector.names)} classes; key map loaded. No camera/input capture performed.")
