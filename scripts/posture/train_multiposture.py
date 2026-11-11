"""Train a small trunk-only research classifier; never upload participant data.

Uses the project's locked NumPy, no extra packages. Run from the repository root.
The exported model is advisory only, not a neck-angle estimator or score policy.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path

import numpy as np

SOURCE = "https://zenodo.org/records/14230872"
EXPECTED_MD5 = "7efbc94d653acf32eefecec3ff26d6c6"
CLASSES = ["upright", "forward", "backward", "lateral"]
LABELS = {"TUP": 0, "TLF": 1, "TLB": 2, "TLL": 3, "TLR": 3}
FEATURES = ["abs_torso_x", "torso_y", "torso_z", "abs_head_x", "head_y", "head_z", "abs_shoulder_y"]


def features(row):
    def point(name):
        return np.array([float(row[f"{name}_{axis}"]) for axis in "xyz"])
    left, right = point("left_shoulder"), point("right_shoulder")
    shoulder = (left + right) / 2
    hip = (point("left_hip") + point("right_hip")) / 2
    width = np.linalg.norm(left - right)
    if not np.isfinite(width) or width < 1e-6:
        raise ValueError("Invalid shoulder width")
    torso, head = (shoulder - hip) / width, (point("nose") - shoulder) / width
    return [abs(torso[0]), torso[1], torso[2], abs(head[0]), head[1], head[2], abs(left[1] - right[1]) / width]


def softmax(logits):
    exp = np.exp(logits - logits.max(axis=1, keepdims=True))
    return exp / exp.sum(axis=1, keepdims=True)


def fit(x, y, groups, steps=600):
    # Fit every learned quantity only on the training participants in this fold.
    mean, scale = x.mean(axis=0), np.maximum(x.std(axis=0), 1e-5)
    z = (x - mean) / scale
    rng = np.random.default_rng(20261017)
    params = [rng.normal(0, 0.15, (x.shape[1], 16)), np.zeros(16),
              rng.normal(0, 0.15, (16, len(CLASSES))), np.zeros(len(CLASSES))]
    # Equal participant contribution, then balance the weighted class mass.
    weight = np.array([1 / np.sum(groups == group) for group in groups])
    mass = np.bincount(y, weights=weight, minlength=len(CLASSES))
    weight /= mass[y]
    weight /= weight.sum()
    target = np.eye(len(CLASSES))[y]
    m, v = [np.zeros_like(p) for p in params], [np.zeros_like(p) for p in params]
    for step in range(1, steps + 1):
        w1, b1, w2, b2 = params
        hidden = np.tanh(z @ w1 + b1)
        error = (softmax(hidden @ w2 + b2) - target) * weight[:, None]
        inner = (error @ w2.T) * (1 - hidden ** 2)
        gradients = [z.T @ inner + 0.001 * w1, inner.sum(axis=0),
                     hidden.T @ error + 0.001 * w2, error.sum(axis=0)]
        for index, gradient in enumerate(gradients):
            m[index] = 0.9 * m[index] + 0.1 * gradient
            v[index] = 0.999 * v[index] + 0.001 * gradient ** 2
            params[index] -= 0.02 * (m[index] / (1 - 0.9 ** step)) / (np.sqrt(v[index] / (1 - 0.999 ** step)) + 1e-8)
    return dict(mean=mean.tolist(), scale=scale.tolist(),
                w1=params[0].tolist(), b1=params[1].tolist(), w2=params[2].tolist(), b2=params[3].tolist(),
                # Training-domain check; it is not a calibrated probability bound.
                lower=np.quantile(x, 0.005, axis=0).tolist(), upper=np.quantile(x, 0.995, axis=0).tolist())


def predict(model, x):
    z = (x - model["mean"]) / model["scale"]
    return softmax(np.tanh(z @ model["w1"] + model["b1"]) @ model["w2"] + model["b2"])


def accepted(model, x, probability):
    spread = np.array(model["upper"]) - model["lower"]
    domain = ((x >= np.array(model["lower"]) - 0.25 * spread)
              & (x <= np.array(model["upper"]) + 0.25 * spread)).all(axis=1)
    ordered = np.sort(probability, axis=1)
    return domain & (ordered[:, -1] >= 0.85) & (ordered[:, -1] - ordered[:, -2] >= 0.25)


def metrics(y, predicted, mask=None):
    mask = np.ones(len(y), dtype=bool) if mask is None else mask
    matrix = np.zeros((len(CLASSES), len(CLASSES)), dtype=int)
    for actual, pred in zip(y[mask], predicted[mask]):
        matrix[actual, pred] += 1
    recalls = [float(matrix[i, i] / matrix[i].sum()) if matrix[i].sum() else None for i in range(len(CLASSES))]
    valid = [value for value in recalls if value is not None]
    return {"n": int(mask.sum()), "coverage": float(mask.mean()),
            "accuracy": float((y[mask] == predicted[mask]).mean()) if mask.any() else None,
            "balanced_accuracy": float(np.mean(valid)) if valid else None,
            "recall": dict(zip(CLASSES, recalls)), "confusion": matrix.tolist()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path("reports/posture-augmentation/data/multiposture.csv"))
    parser.add_argument("--out", type=Path, default=Path("reports/posture-augmentation/training"))
    args = parser.parse_args()
    digest = hashlib.md5(args.data.read_bytes()).hexdigest()
    if digest != EXPECTED_MD5:
        raise ValueError("Dataset checksum differs; audit the new revision before training")
    with args.data.open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source))
    x = np.array([features(row) for row in rows])
    y = np.array([LABELS[row["upperbody_label"]] for row in rows])
    groups = np.array([int(row["subject"]) for row in rows])
    if not np.isfinite(x).all() or len(np.unique(groups)) != 13:
        raise ValueError("Unexpected dataset shape/values")
    # Reject cross-participant exact feature duplicates rather than leaking identities.
    owners = {}
    for row, group in zip(x, groups):
        key = row.tobytes()
        if key in owners and owners[key] != group:
            raise ValueError("Identical features assigned to different participants")
        owners[key] = group
    probability, masks = np.zeros((len(y), len(CLASSES))), np.zeros(len(y), dtype=bool)
    folds = []
    for group in np.unique(groups):
        test = groups == group
        model = fit(x[~test], y[~test], groups[~test])
        probability[test] = predict(model, x[test])
        masks[test] = accepted(model, x[test], probability[test])
        folds.append({"subject": int(group), "train_subjects": np.unique(groups[~test]).tolist(),
                      "all": metrics(y[test], probability[test].argmax(axis=1)),
                      "accepted": metrics(y[test], probability[test].argmax(axis=1), masks[test])})
        print(f"Held-out participant {group}: {folds[-1]['all']['accuracy']:.3f}", flush=True)
    predicted = probability.argmax(axis=1)
    summary = {"source": SOURCE, "license": "CC-BY-4.0", "md5": digest, "rows": len(rows), "columns": len(rows[0]),
               "subjects": np.unique(groups).tolist(), "features": FEATURES, "classes": CLASSES,
               "method": "fixed 7-16-4 tanh MLP, leave-one-participant-out, seed 20261017, 600 Adam steps",
               "all": metrics(y, predicted), "accepted": metrics(y, predicted, masks), "folds": folds,
               "majority_baseline": metrics(y, np.full(len(y), np.bincount(y).argmax())),
               "limitation": "LOSO on MultiPosture only. No Moti webcam, visibility, temporal, CVA or clinical validation. Softmax is not calibrated correctness probability."}
    final = fit(x, y, groups)
    artifact = {"version": "multiposture-trunk-mlp-v1", "featureVersion": "shoulder-normalized-world-v1",
                "source": SOURCE, "license": "CC-BY-4.0", "sourceMd5": digest, "classes": CLASSES,
                "features": FEATURES, "minConfidence": 0.85, "minMargin": 0.25, "domainPadding": 0.25,
                "usage": "bounded-auxiliary", **final}
    args.out.mkdir(parents=True, exist_ok=True)
    for name, value in [("evaluation.json", summary), ("model.json", artifact)]:
        (args.out / name).write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    # Per-row held-out predictions for the local visual inspector, never training-set accuracy.
    (args.out / "predictions.json").write_text(json.dumps({"sourceMd5": digest, "method": "LOSO",
        "rows": [{"csvRow": i + 2, "subject": int(groups[i]), "actual": int(y[i]),
                  "predicted": int(predicted[i]), "probabilities": probability[i].tolist(),
                  "accepted": bool(masks[i])} for i in range(len(rows))]}, allow_nan=False), encoding="utf-8")
    (args.out / "trunkModel.ts").write_text(
        "// Generated by scripts/posture/train_multiposture.py; see docs/posture-model-card.md.\n"
        "export const trunkModel = " + json.dumps(artifact, separators=(",", ":"), allow_nan=False) + ";\n",
        encoding="utf-8")
    # No participant coordinates in the shipped model. A few synthetic features test TS/Python parity.
    synthetic = np.array([final["mean"], np.array(final["mean"]) + 0.3 * np.array(final["scale"]),
                          np.array(final["mean"]) - 0.5 * np.array(final["scale"])])
    (args.out / "parity.json").write_text(json.dumps({"features": synthetic.tolist(),
        "probabilities": predict(final, synthetic).tolist()}, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"all": summary["all"], "accepted": summary["accepted"]}, indent=2))


if __name__ == "__main__":
    main()
