"""Build an offline, self-contained visual inspector from local LOSO predictions."""
import csv
import hashlib
import json
from pathlib import Path

from train_multiposture import CLASSES, EXPECTED_MD5, LABELS, features, metrics
import numpy as np


def build():
    root = Path(__file__).resolve().parents[2]
    folder = root / "reports/posture-augmentation"
    data = folder / "data/multiposture.csv"
    if hashlib.md5(data.read_bytes()).hexdigest() != EXPECTED_MD5:
        raise ValueError("Dataset revision differs")
    with data.open(encoding="utf-8-sig", newline="") as source:
        raw = list(csv.DictReader(source))
    evaluation = json.loads((folder / "training/evaluation.json").read_text(encoding="utf-8"))
    predictions = json.loads((folder / "training/predictions.json").read_text(encoding="utf-8"))
    if predictions["method"] != "LOSO" or predictions["sourceMd5"] != EXPECTED_MD5 or len(predictions["rows"]) != len(raw):
        raise ValueError("Run train_multiposture.py to produce matching held-out predictions")
    joints = [name[:-2] for name in raw[0] if name.endswith("_x")]
    rows = []
    for i, (record, pred) in enumerate(zip(raw, predictions["rows"])):
        if pred["csvRow"] != i + 2 or pred["subject"] != int(record["subject"]) or pred["actual"] != LABELS[record["upperbody_label"]]:
            raise ValueError("Prediction row alignment differs")
        rows.append({**pred, "label": record["upperbody_label"],
            "joints": [[round(float(record[f"{joint}_{axis}"]), 5) for axis in "xyz"] for joint in joints],
            "features": features(record)})
    # Fail rather than display stale aggregate scores beside different per-row predictions.
    y = np.array([r["actual"] for r in rows])
    pred = np.array([r["predicted"] for r in rows])
    accepted = np.array([r["accepted"] for r in rows])
    if metrics(y, pred) != evaluation["all"] or metrics(y, pred, accepted) != evaluation["accepted"]:
        raise ValueError("Evaluation does not match per-row held-out predictions")
    stability_file = folder / "robustness-results.json"
    stability = json.loads(stability_file.read_text(encoding="utf-8")) if stability_file.exists() else None
    payload = json.dumps({"rows": rows, "evaluation": evaluation, "joints": joints, "classes": CLASSES, "stability": stability},
        ensure_ascii=False, allow_nan=False, separators=(",", ":")).replace("<", "\\u003c")
    template = Path(__file__).with_name("model_report.html").read_text(encoding="utf-8")
    tokens = (root / "front/src/styles/tokens.css").read_text(encoding="utf-8").replace("@theme", ":root")
    target = folder / "model-inspector.html"
    target.write_text(template.replace("/*__TOKENS__*/", tokens).replace("__DATA__", payload), encoding="utf-8")
    print(f"Created {target} ({len(rows)} aligned held-out rows)")


if __name__ == "__main__":
    build()
