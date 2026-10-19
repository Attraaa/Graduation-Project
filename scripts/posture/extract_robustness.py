"""Extract local same-image scale variants, not new posture ground truth.

No source image is written, uploaded or executed. Uses the user-provided archive
only for local robustness evaluation; that archive's redistribution license is unknown.
"""
import argparse
import json
import random
from pathlib import Path
from zipfile import ZipFile

import cv2
import mediapipe as mp
import numpy as np


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", type=Path, required=True)
    parser.add_argument("--count", type=int, default=36)
    parser.add_argument("--out", type=Path, default=Path("reports/posture-augmentation/image-landmarks.json"))
    args = parser.parse_args()
    samples = []
    with ZipFile(args.zip) as archive, mp.solutions.pose.Pose(static_image_mode=True, model_complexity=1, min_detection_confidence=0.5) as pose:
        names = sorted(name for name in archive.namelist() if Path(name).name.startswith("front_") and name.lower().endswith((".jpg", ".jpeg", ".png")) and "__MACOSX" not in name)
        if not names:
            raise ValueError("No frontal images in the archive")
        chosen = random.Random(20261017).sample(names, min(args.count, len(names)))
        for index, name in enumerate(chosen):
            info = archive.getinfo(name)
            if info.file_size > 20_000_000:
                raise ValueError("Unexpected image size")
            original = cv2.imdecode(np.frombuffer(archive.read(name), np.uint8), cv2.IMREAD_COLOR)
            if original is None:
                raise ValueError("Image decode failed")
            height, width = original.shape[:2]
            for scale in [1, 0.75, 1.2]:
                matrix = np.array([[scale, 0, width * (1 - scale) / 2], [0, scale, height * (1 - scale) / 2]])
                image = cv2.warpAffine(original, matrix, (width, height), borderValue=(127, 127, 127))
                result = pose.process(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
                def points(value):
                    return [{"x": p.x, "y": p.y, "z": p.z, "visibility": p.visibility} for p in value.landmark] if value else None
                samples.append({"sample": index, "scale": scale, "widthPx": width, "heightPx": height,
                                "landmarks": points(result.pose_landmarks), "worldLandmarks": points(result.pose_world_landmarks)})
            print(f"Image {index + 1}/{len(chosen)}", flush=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"method": "seeded frontal images; synthetic rescaling; static MediaPipe Full; not a diagnostic accuracy test",
                                    "source": str(args.zip), "samples": samples}, allow_nan=False), encoding="utf-8")


if __name__ == "__main__":
    main()
