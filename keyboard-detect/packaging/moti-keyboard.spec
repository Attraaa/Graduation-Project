from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules, get_package_paths


root = Path(SPECPATH).parent
analysis = Analysis(
    [str(root / "packaging" / "entry.py")],
    pathex=[str(root), str(root / "src")],
    # torchvision 0.29 loads *_stable.pyd indirectly; the upstream hook only lists the older _C name.
    binaries=[(str(file), "torchvision")
              for file in Path(get_package_paths("torchvision")[1]).glob("*.pyd")],
    datas=[
        (str(root / "models" / "best.pt"), "models"),
        (str(root / "data" / "perfect_map.json"), "data"),
        *collect_data_files("mediapipe"),
        *collect_data_files("ultralytics"),
    ],
    hiddenimports=[
        "engineio.async_drivers.threading",
        "pynput.keyboard._win32",
        "pynput.mouse._win32",
        *collect_submodules("ultralytics.nn"),
    ],
    # Optional training/notebook/UI backends are not used by the local service.
    # PyInstaller appends __main__ to this list; including it here keeps incremental cache keys stable.
    excludes=["tkinter", "IPython", "pytest", "jax", "jaxlib", "tensorflow", "tensorboard",
              "PyQt5", "PyQt6", "PySide2", "PySide6", "roboflow", "__main__"],
    module_collection_mode={"ultralytics": "pyz+py"},
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
