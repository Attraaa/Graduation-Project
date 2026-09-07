"""Check runtime imports and bundled resources without opening cameras or capturing keys."""
from pathlib import Path
import json
import platform
import sys

import cv2
import mediapipe as mp
import numpy as np
import torch
from ultralytics import YOLO

root = Path(__file__).resolve().parents[1]
toolchain = json.loads((root.parent / "toolchain.json").read_text(encoding="utf-8"))
if platform.python_version() != toolchain["python"]:
    raise RuntimeError("Python version differs from toolchain.json; run setup.cmd.")
if not hasattr(mp, "solutions"):
    raise RuntimeError("This implementation requires MediaPipe's legacy solutions API.")
model = YOLO(str(root / "models" / "best.pt"))
key_map = json.loads((root / "data" / "perfect_map.json").read_text(encoding="utf-8"))
if not key_map:
    raise RuntimeError("The keyboard map is empty.")
print(f"Python {platform.python_version()} ({sys.executable})")
print(f"OpenCV {cv2.__version__}, NumPy {np.__version__}, MediaPipe {mp.__version__}, Torch {torch.__version__}")
print(f"Keyboard model loaded: {len(model.names)} classes; key map loaded. No camera/input capture performed.")
