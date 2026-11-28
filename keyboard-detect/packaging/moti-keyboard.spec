from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files


root = Path(SPECPATH).parent
analysis = Analysis(
    [str(root / "packaging" / "entry.py")],
    pathex=[str(root), str(root / "src")],
    datas=[
        (str(root / "models" / "best.onnx"), "models"),
        (str(root / "data" / "perfect_map.json"), "data"),
        *collect_data_files("mediapipe"),
    ],
    hiddenimports=[
        "engineio.async_drivers.threading",
        "pynput.keyboard._win32",
        "pynput.mouse._win32",
    ],
    # Optional training/notebook/UI backends are not used by the local service. PyTorch and
    # Ultralytics are model tools (export/training); the analyzer runs best.onnx.
    # PyInstaller appends __main__ to this list; including it here keeps incremental cache keys stable.
    excludes=["tkinter", "IPython", "pytest", "jax", "jaxlib", "tensorflow", "tensorboard",
              "PyQt5", "PyQt6", "PySide2", "PySide6", "roboflow", "torch", "torchvision", "ultralytics",
              "__main__"],
)
pyz = PYZ(analysis.pure)
exe = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="moti-keyboard",
    console=True,  # Electron captures stderr and hides the process window.
    upx=False,
)
COLLECT(exe, analysis.binaries, analysis.datas, name="moti-keyboard", upx=False)
