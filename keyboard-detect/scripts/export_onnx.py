"""Export models/best.pt to models/best.onnx, the file the analyzer runs.

Run from keyboard-detect after retraining best.pt (PyTorch is needed only here):
    uv run --locked --managed-python --group model python scripts/export_onnx.py

The graph takes any input size (dynamic axes) so the analyzer can pad frames exactly as
Ultralytics did for best.pt. The checkpoint's SHA-256 is stored in the ONNX metadata; the
unit tests fail when best.pt changes without a new export.
"""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_KEY = "source_sha256"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--weights", type=Path, default=ROOT / "models" / "best.pt")
    parser.add_argument("--imgsz", type=int, default=800, help="example input size used for tracing (the analyzer's size)")
    args = parser.parse_args(argv)

    # A build step must not pip-install packages or send usage analytics.
    os.environ.setdefault("YOLO_AUTOINSTALL", "false")
    os.environ.setdefault("YOLO_OFFLINE", "1")
    import onnx
    from onnx import helper
    from ultralytics import YOLO

    weights = args.weights.resolve(strict=True)
    exported = Path(YOLO(str(weights)).export(format="onnx", imgsz=args.imgsz, dynamic=True, simplify=True, batch=1))

    model = onnx.load(str(exported))
    metadata = {prop.key: prop.value for prop in model.metadata_props}
    metadata[SOURCE_KEY] = sha256(weights)
    helper.set_model_props(model, metadata)
    onnx.checker.check_model(model)
    onnx.save(model, str(exported))

    shape = lambda value: [d.dim_param or d.dim_value for d in value.type.tensor_type.shape.dim]  # noqa: E731
    print(f"{exported} ({exported.stat().st_size / 1e6:.1f} MB, opset {model.opset_import[0].version})")
    print(f"  input {shape(model.graph.input[0])} -> output {shape(model.graph.output[0])}")
    print(f"  classes {metadata.get('names')}; {SOURCE_KEY} {metadata[SOURCE_KEY]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
