"""Exercise the shipped executable without a camera, global key capture, or API/DB."""
import argparse
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

import cv2
import numpy as np
import socketio


def check_package(executable):
    executable = str(Path(executable).resolve(strict=True))
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    token = secrets.token_urlsafe(32)
    origin = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="moti-keyboard-package-") as temporary:
        env = dict(os.environ)
        for name in ("PYTHONHOME", "PYTHONPATH"):
            env.pop(name, None)
        # No project Python, DLLs, config directories or approved apps in the child environment.
        env.update(PATH=str(Path(os.environ["SystemRoot"]) / "System32"),
                   MOTI_KEYBOARD_TOKEN=token, MOTI_APPROVED_APPS="[]",
                   YOLO_CONFIG_DIR=str(Path(temporary) / "ultralytics"),
                   MPLCONFIGDIR=str(Path(temporary) / "matplotlib"))
        with (Path(temporary) / "service.log").open("w+b") as log:
            child = subprocess.Popen([executable, "--host", "127.0.0.1", "--port", str(port), "--embedded"],
                                     cwd=temporary, env=env, stdout=log, stderr=log,
                                     creationflags=subprocess.CREATE_NO_WINDOW)
            client = socketio.Client(reconnection=False)
            try:
                deadline = time.monotonic() + 45
                while True:
                    if child.poll() is not None:
                        raise RuntimeError(f"Packaged service exited with {child.returncode}")
                    try:
                        with urlopen(origin + "/api/status", timeout=1) as response:
                            status = json.load(response)
                        assert status["ok"] and not status["keylogger_running"]
                        break
                    except (URLError, TimeoutError):
                        if time.monotonic() >= deadline:
                            raise RuntimeError("Packaged service did not start within Electron's 45-second deadline")
                        time.sleep(.25)
                try:
                    urlopen(origin + "/", timeout=2).close()
                    raise AssertionError("Embedded service exposed its test page")
                except HTTPError as error:
                    assert error.code == 404

                rejected = socketio.Client(reconnection=False)
                try:
                    rejected.connect(origin, auth={"token": "wrong"}, transports=["polling"])
                    raise AssertionError("Service accepted an invalid token")
                except socketio.exceptions.ConnectionError:
                    pass
                finally:
                    rejected.disconnect()

                result_ready = threading.Event()
                results = []

                @client.on("press_result")
                def press_result(payload):
                    results.append(payload)
                    result_ready.set()

                client.connect(origin, auth={"token": token}, transports=["polling"])
                _, jpeg = cv2.imencode(".jpg", np.zeros((360, 640, 3), dtype=np.uint8))
                # A synthetic blank frame exercises the shipped MediaPipe graph and models.
                frame = client.call("frame", {"token": token, "image": jpeg.tobytes()}, timeout=30)
                assert frame["ok"], frame
                # A blank image should fail recognition normally, after running YOLO inference.
                automatic = client.call("calibrate_keyboard", {"token": token}, timeout=30)
                assert "mapping" in automatic, automatic
                manual = client.call("manual_keyboard", {"token": token, "grid": {
                    "source": "manual", "quad": [[.1, .1], [.9, .1], [.9, .9], [.1, .9]],
                }}, timeout=5)
                assert manual["ok"] and len(manual["mapping"]["keys"]) == 61, manual
                key = client.call("browser_key", {"token": token, "code": "KeyQ"}, timeout=5)
                assert key["ok"] and result_ready.wait(5), key
                assert results[0]["key_event"]["code"] == "KeyQ", results
                assert client.call("stop_observation", {"token": token}, timeout=5)["ok"]
                with urlopen(origin + "/api/status", timeout=2) as response:
                    assert json.load(response)["frames"] == 0
                print("Packaged keyboard: startup, token rejection, MediaPipe/YOLO inference, 61-key manual map, input/result and pause passed.")
            except Exception:
                log.flush()
                log.seek(0)
                print(log.read().decode("utf-8", errors="replace")[-12000:])
                raise
            finally:
                client.disconnect()
                if child.poll() is None:
                    child.terminate()
                    child.wait(timeout=10)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("executable", type=Path)
    check_package(parser.parse_args().executable)
