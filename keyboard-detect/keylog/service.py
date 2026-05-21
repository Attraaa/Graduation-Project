"""Local realtime test server for key press attribution.

Run from the project root:
    python -m keylog.service
Then open:
    http://127.0.0.1:5055
"""

from __future__ import annotations

import argparse
import base64
import queue
import sys
import threading
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from flask import Flask, jsonify, render_template, request

from .analyzer import KeyboardPressAnalyzer
from .events import FrameSnapshot, KeyEvent
from .finger_tracker import MediaPipeFingerTracker
from .frame_buffer import FrameBuffer
from .key_capture import RealTimeKeyLogger, normalize_key_name
from .secure_channel import LocalSessionSecurity


ROOT = Path(__file__).resolve().parent.parent


def decode_data_url(data_url: str):
    _, b64 = data_url.split(",", 1)
    raw = base64.b64decode(b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


class RealtimeAttributionService:
    """Owns the local test server state."""

    def __init__(
        self,
        camera_receive_delay_ms: float = 80.0,
        analysis_wait_ms: float = 120.0,
        max_frames: int = 180,
        enable_global_keylogger: bool = False,
        use_mediapipe: bool = True,
    ):
        try:
            from flask_socketio import SocketIO
        except ImportError as exc:
            raise RuntimeError(
                "flask-socketio and simple-websocket are required for the test server. "
                "Install them with: pip install flask-socketio simple-websocket"
            ) from exc

        self.security = LocalSessionSecurity()
        self.frame_buffer = FrameBuffer(max_frames=max_frames)
        self.camera_receive_delay_ms = camera_receive_delay_ms
        self.analysis_wait_ms = analysis_wait_ms
        self.event_queue: "queue.Queue[KeyEvent]" = queue.Queue()
        self._frame_sequence = 0
        self._browser_event_sequence = 0
        self._stop_event = threading.Event()
        self._worker = threading.Thread(target=self._process_events, daemon=True)

        tracker = MediaPipeFingerTracker() if use_mediapipe else None
        self.analyzer = KeyboardPressAnalyzer(finger_tracker=tracker)
        self.keylogger = RealTimeKeyLogger(on_event=self.enqueue_key_event)

        self.app = Flask(__name__, template_folder=str(Path(__file__).parent / "templates"))
        self.socketio = SocketIO(
            self.app,
            async_mode="threading",
            cors_allowed_origins=[],
            logger=False,
            engineio_logger=False,
        )
        self._bind_routes()
        self._bind_socket_events()
        self._worker.start()
        if enable_global_keylogger:
            self.keylogger.start()

    def enqueue_key_event(self, event: KeyEvent) -> None:
        self.event_queue.put(event)

    def _bind_routes(self) -> None:
        @self.app.route("/")
        def index():
            return render_template(
                "test_page.html",
                token=self.security.token,
                camera_delay_ms=self.camera_receive_delay_ms,
                analysis_wait_ms=self.analysis_wait_ms,
            )

        @self.app.route("/api/status")
        def status():
            return jsonify(
                {
                    "ok": True,
                    "keylogger_running": self.keylogger.running,
                    "frames": len(self.frame_buffer),
                    "camera_receive_delay_ms": self.camera_receive_delay_ms,
                    "analysis_wait_ms": self.analysis_wait_ms,
                }
            )

        @self.app.route("/api/keylogger/start", methods=["POST"])
        def start_keylogger():
            if not self._authorized_request():
                return jsonify({"ok": False, "error": "unauthorized"}), 401
            self.keylogger.start()
            return jsonify({"ok": True, "running": self.keylogger.running})

        @self.app.route("/api/keylogger/stop", methods=["POST"])
        def stop_keylogger():
            if not self._authorized_request():
                return jsonify({"ok": False, "error": "unauthorized"}), 401
            self.keylogger.stop()
            return jsonify({"ok": True, "running": self.keylogger.running})

        @self.app.route("/api/timing", methods=["POST"])
        def update_timing():
            if not self._authorized_request():
                return jsonify({"ok": False, "error": "unauthorized"}), 401
            payload = request.get_json(force=True)
            self.camera_receive_delay_ms = float(payload.get("camera_receive_delay_ms", self.camera_receive_delay_ms))
            self.analysis_wait_ms = float(payload.get("analysis_wait_ms", self.analysis_wait_ms))
            return jsonify(
                {
                    "ok": True,
                    "camera_receive_delay_ms": self.camera_receive_delay_ms,
                    "analysis_wait_ms": self.analysis_wait_ms,
                }
            )

    def _bind_socket_events(self) -> None:
        @self.socketio.on("connect")
        def connect(auth):
            token = (auth or {}).get("token")
            if not self.security.require_token(token):
                return False
            return True

        @self.socketio.on("frame")
        def frame(payload):
            if not self.security.require_token((payload or {}).get("token")):
                return {"ok": False, "error": "unauthorized"}
            img = decode_data_url(payload["image"])
            if img is None:
                return {"ok": False, "error": "decode_failed"}
            self._frame_sequence += 1
            fingers = self.analyzer.finger_tracker.detect(img) if self.analyzer.finger_tracker else []
            snapshot = FrameSnapshot(
                frame=img,
                perf_counter_ns=time.perf_counter_ns(),
                wall_time_ns=time.time_ns(),
                sequence=self._frame_sequence,
                browser_perf_ms=_optional_float(payload.get("browser_perf_ms")),
                fingers=fingers,
            )
            self.frame_buffer.add(snapshot)
            return {
                "ok": True,
                "frame": snapshot.to_jsonable(),
                "buffered_frames": len(self.frame_buffer),
            }

        @self.socketio.on("browser_key")
        def browser_key(payload):
            if not self.security.require_token((payload or {}).get("token")):
                return {"ok": False, "error": "unauthorized"}
            self._browser_event_sequence += 1
            event = KeyEvent(
                key=normalize_key_name(payload.get("key", ""), payload.get("code"), payload.get("location")),
                event_type="press",
                source="browser",
                perf_counter_ns=time.perf_counter_ns(),
                wall_time_ns=time.time_ns(),
                browser_perf_ms=_optional_float(payload.get("browser_perf_ms")),
                code=payload.get("code"),
                location=payload.get("location"),
                sequence=self._browser_event_sequence,
            )
            self.enqueue_key_event(event)
            return {"ok": True, "event": event.to_jsonable()}

    def _authorized_request(self) -> bool:
        token = request.headers.get("X-Keylog-Token") or request.args.get("token")
        if not token and request.is_json:
            token = (request.get_json(silent=True) or {}).get("token")
        return self.security.require_token(token)

    def _process_events(self) -> None:
        while not self._stop_event.is_set():
            try:
                event = self.event_queue.get(timeout=0.2)
            except queue.Empty:
                continue

            # Wait briefly so the frame captured at press time can arrive.
            if self.analysis_wait_ms > 0:
                time.sleep(self.analysis_wait_ms / 1000.0)

            snapshot, delta_ms = self.frame_buffer.nearest_for_event(
                event,
                camera_receive_delay_ms=self.camera_receive_delay_ms,
            )
            result = self.analyzer.analyze(event, snapshot, frame_delta_ms=delta_ms)
            payload = result.to_jsonable()
            payload["latency"]["queue_wait_ms"] = self.analysis_wait_ms
            self.socketio.emit("press_result", payload)

    def run(self, host: str, port: int, debug: bool = False) -> None:
        print("[keylog] local token:", self.security.token)
        print(f"[keylog] open http://{host}:{port}")
        self.socketio.run(self.app, host=host, port=port, debug=debug, allow_unsafe_werkzeug=True)

    def close(self) -> None:
        self._stop_event.set()
        self.keylogger.stop()
        if self.analyzer.finger_tracker:
            self.analyzer.finger_tracker.close()


def _optional_float(value) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5055)
    parser.add_argument("--camera-delay-ms", type=float, default=80.0)
    parser.add_argument("--analysis-wait-ms", type=float, default=120.0)
    parser.add_argument("--global-keylogger", action="store_true")
    parser.add_argument("--no-mediapipe", action="store_true")
    args = parser.parse_args(argv)

    service = RealtimeAttributionService(
        camera_receive_delay_ms=args.camera_delay_ms,
        analysis_wait_ms=args.analysis_wait_ms,
        enable_global_keylogger=args.global_keylogger,
        use_mediapipe=not args.no_mediapipe,
    )
    try:
        service.run(args.host, args.port)
    finally:
        service.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
