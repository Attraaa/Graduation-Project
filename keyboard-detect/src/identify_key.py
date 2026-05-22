"""
Phase 4: Given an (x, y) pixel and a result_map, return the key name.
"""

from typing import Dict, Optional

import cv2
import numpy as np


def identify_key(x: float, y: float, result_map: Dict[str, np.ndarray]) -> Optional[str]:
    pt = (float(x), float(y))
    for name, polygon in result_map.items():
        poly_int = polygon.astype(np.int32)
        if cv2.pointPolygonTest(poly_int, pt, False) >= 0:
            return name
    return None


if __name__ == "__main__":
    import argparse
    import cv2
    from keyboard_mapper import KeyboardCoordinateMapper

    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True)
    ap.add_argument("--model", default="models/best.pt")
    ap.add_argument("--map", default="data/perfect_map.json")
    ap.add_argument("--xy", nargs=2, type=float, required=True, metavar=("X", "Y"))
    args = ap.parse_args()

    mapper = KeyboardCoordinateMapper(model_path=args.model, perfect_map_path=args.map, imgsz=960)
    image = cv2.imread(args.image)
    if image is None:
        raise FileNotFoundError(args.image)
    result = mapper.map_frame(image)
    if not result.ok:
        raise RuntimeError(f"mapping failed: {result.reason} missing={result.missing}")
    key = result.key_at(args.xy[0], args.xy[1])
    print(key if key else "(no key at that point)")
