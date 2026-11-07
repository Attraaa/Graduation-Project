"""Windows executable entry point; writable caches stay outside the install folder."""
import multiprocessing
import os
from pathlib import Path


if __name__ == "__main__":
    multiprocessing.freeze_support()
    cache = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "Moti" / "keyboard"
    os.environ.setdefault("YOLO_CONFIG_DIR", str(cache / "ultralytics"))
    os.environ.setdefault("MPLCONFIGDIR", str(cache / "matplotlib"))
    Path(os.environ["YOLO_CONFIG_DIR"]).mkdir(parents=True, exist_ok=True)

    from keylog.service import main

    raise SystemExit(main())
