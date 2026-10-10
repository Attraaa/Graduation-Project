"""Local realtime test server for key press attribution.

Run from the project root:
    python -m keylog.service
Then open:
    http://127.0.0.1:5055
"""

from __future__ import annotations

import argparse
import json
import base64
import os
import queue
import sys
import threading
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from flask import Flask, abort, jsonify, render_template, request

from .analyzer import KeyboardPressAnalyzer
from .events import FrameSnapshot, KeyEvent
from .finger_tracker import MediaPipeFingerTracker
from .frame_buffer import FrameBuffer
from .key_capture import RealTimeKeyLogger
from .secure_channel import LocalSessionSecurity
from .raw_input import RawInputObserver, key_label, SCAN_CODES, EXTENDED_CODES
from .manual_mapping import manual_mapping


ROOT = Path(__file__).resolve().parent.parent


def decode_data_url(data_url: str):
    if isinstance(data_url, (bytes, bytearray)):
        if not data_url or len(data_url) > 4_000_000:
            return None
        return cv2.imdecode(np.frombuffer(data_url, dtype=np.uint8), cv2.IMREAD_COLOR)
    if not isinstance(data_url, str) or len(data_url) > 4_000_000 or not data_url.startswith('data:image/jpeg;base64,'):
        return None
    _, b64 = data_url.split(",", 1)
    raw = base64.b64decode(b64, validate=True)
    arr = np.frombuffer(raw, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


class RealtimeAttributionService:
    """Owns the local test server state."""

    def __init__(
        self,
        camera_receive_delay_ms: float = 80.0,
        analysis_wait_ms: float = 120.0,
        max_frames: int = 12,
        enable_global_keylogger: bool = False,
        use_mediapipe: bool = True,
        token: Optional[str] = None,
        expose_test_page: bool = True,
        approved_apps=None,
    ):
        try:
            from flask_socketio import SocketIO
        except ImportError as exc:
            raise RuntimeError(
                "flask-socketio and simple-websocket are required for the test server. "
                "Install them with: pip install flask-socketio simple-websocket"
            ) from exc

        self.security = LocalSessionSecurity(token=token)
        self.frame_buffer = FrameBuffer(max_frames=max_frames)
        self.camera_receive_delay_ms = camera_receive_delay_ms
        self.analysis_wait_ms = analysis_wait_ms
        self.expose_test_page = expose_test_page
        self.event_queue: "queue.Queue[KeyEvent]" = queue.Queue(maxsize=64)
        self._privacy_generation = 0
        self._state_lock = threading.RLock()
        self._mapping_ready = False
        self._client = None
        self.observer = None
        self.observation_status = 'off'
        if approved_apps:
            self.observer = RawInputObserver(approved_apps, self._external_press, self._observation_status)
        self._frame_sequence = 0
        self._browser_event_sequence = 0
        self._sequence_lock = threading.Lock()
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
            max_http_buffer_size=4_000_000,
        )
        self._bind_routes()
        self._bind_socket_events()
        self._worker.start()
        if enable_global_keylogger:
            self.keylogger.start()

    def enqueue_key_event(self, event: KeyEvent) -> None:
        try:
            self.event_queue.put_nowait((self._privacy_generation, event))
        except queue.Full:
            pass

    def _external_press(self, code, context):
        if not self._mapping_ready or not self._client:
            return
        self.enqueue_key_event(KeyEvent(key=key_label(code), code=code, context=context, source='approved-app',
                                       perf_counter_ns=time.perf_counter_ns(), wall_time_ns=time.time_ns(),
                                       sequence=self._next_sequence()))

    def _next_sequence(self):
        with self._sequence_lock:
            self._browser_event_sequence += 1
            return self._browser_event_sequence

    def _clear_transient(self):
        self._privacy_generation += 1
        self.frame_buffer.clear()
        while True:
            try: self.event_queue.get_nowait()
            except queue.Empty: break

    def _observation_status(self, status):
        self.observation_status = status
        if status != 'observing': self._clear_transient()
        if self._client: self.socketio.emit('observation_status', {'status': status}, to=self._client)

    def _bind_routes(self) -> None:
        @self.app.route("/")
        def index():
            if not self.expose_test_page:
                abort(404)
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
            if not self.expose_test_page:
                return jsonify({'ok': False, 'error': 'disabled_in_embedded_mode'}), 403
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
            if self._client:
                return False
            self._client = request.sid
            return True

        @self.socketio.on('disconnect')
        def disconnect():
            if request.sid == self._client:
                self._client = None
                if self.observer: self.observer.stop()
                self._clear_transient()

        @self.socketio.on('start_observation')
        def start_observation(payload):
            if not self.security.require_token((payload or {}).get('token')) or request.sid != self._client:
                return {'ok': False}
            if not self.observer: return {'ok': True, 'status': 'off'}
            try:
                self.observer.start()
                return {'ok': True, 'status': self.observation_status}
            except RuntimeError:
                self._observation_status('error')
                return {'ok': False, 'status': 'error'}

        @self.socketio.on('reset_analysis')
        def reset_analysis(payload):
            if not self.security.require_token((payload or {}).get('token')): return {'ok': False}
            with self._state_lock:
                self._mapping_ready = False
                self._clear_transient(); self.analyzer.unfreeze_mapping()
            return {'ok': True}

        @self.socketio.on('stop_observation')
        def stop_observation(payload):
            if not self.security.require_token((payload or {}).get('token')) or request.sid != self._client:
                return {'ok': False}
            if self.observer:
                self.observer.stop()
            with self._state_lock:
                self._mapping_ready = False
                self._clear_transient()
            return {'ok': True, 'status': 'off'}

        @self.socketio.on("frame")
        def frame(payload):
            if not self.security.require_token((payload or {}).get("token")):
                return {"ok": False, "error": "unauthorized"}
            generation = self._privacy_generation
            received_ns = time.perf_counter_ns()
            try:
                img = decode_data_url(payload.get('image'))
            except (ValueError, TypeError):
                img = None
            if img is None:
                return {"ok": False, "error": "decode_failed"}
            if img.shape[0] > 2160 or img.shape[1] > 3840:
                return {'ok': False, 'error': 'frame_too_large'}
            self._frame_sequence += 1
            mirrored = payload.get('input_is_mirrored', False)
            if type(mirrored) is not bool: return {'ok': False, 'error': 'invalid_image_direction'}
            inference_started = time.perf_counter_ns()
            fingers = self.analyzer.finger_tracker.detect(img, input_is_mirrored=mirrored) if self.analyzer.finger_tracker else []
            inference_ms = (time.perf_counter_ns() - inference_started) / 1_000_000
            snapshot = FrameSnapshot(
                frame=img,
                perf_counter_ns=received_ns,
                wall_time_ns=time.time_ns(),
                sequence=self._frame_sequence,
                browser_perf_ms=_optional_float(payload.get("browser_perf_ms")),
                fingers=fingers,
            )
            if generation != self._privacy_generation:
                return {'ok': False, 'error': 'analysis_reset'}
            self.frame_buffer.add(snapshot)
            return {
                "ok": True,
                "frame": snapshot.to_jsonable(),
                "buffered_frames": len(self.frame_buffer),
                "timing": {"inference_ms": inference_ms},
            }

        @self.socketio.on("browser_key")
        def browser_key(payload):
            if not self.security.require_token((payload or {}).get("token")):
                return {"ok": False, "error": "unauthorized"}
            if not self.analyzer.frozen:
                return {"ok": False, "error": "keyboard_not_mapped"}
            code = payload.get('code')
            if code not in set(SCAN_CODES.values()) | set(EXTENDED_CODES.values()):
                return {'ok': False, 'error': 'unsupported_code'}
            context = payload.get('context', 'plain')
            if context not in {'plain', 'shift-left', 'shift-right', 'shift-both', 'shortcut'}:
                return {'ok': False, 'error': 'invalid_context'}
            event = KeyEvent(
                key=key_label(code),
                event_type="press",
                source="browser",
                perf_counter_ns=time.perf_counter_ns(),
                wall_time_ns=time.time_ns(),
                browser_perf_ms=_optional_float(payload.get("browser_perf_ms")),
                code=payload.get("code"),
                location=payload.get("location"),
                sequence=self._next_sequence(),
                context=context,
            )
            self.enqueue_key_event(event)
            return {"ok": True, "event": event.to_jsonable()}

        @self.socketio.on("calibrate_keyboard")
        def calibrate_keyboard(payload):
            if not self.security.require_token((payload or {}).get("token")):
                return {"ok": False, "error": "unauthorized"}
            snapshot = self.frame_buffer.latest()
            if snapshot is None:
                return {"ok": False, "error": "no_frame_available"}

            with self._state_lock:
                self.analyzer.unfreeze_mapping()
                self._mapping_ready = False
                generation = self._privacy_generation
            mapping = self.analyzer.map_keyboard(snapshot.frame)
            with self._state_lock:
                if generation != self._privacy_generation:
                    return {'ok': False, 'error': 'analysis_reset'}
                if mapping.ok:
                    self.analyzer.freeze_mapping(mapping)
                    self._mapping_ready = True
            response_mapping = mapping.to_jsonable()
            response_mapping["size"] = [snapshot.width, snapshot.height]
            response_mapping["mode"] = "frozen" if mapping.ok else "live"
            return {
                "ok": mapping.ok,
                "error": None if mapping.ok else (mapping.reason or "keyboard_mapping_failed"),
                "mapping": response_mapping,
            }

        @self.socketio.on('manual_keyboard')
        def manual_keyboard(payload):
            if not self.security.require_token((payload or {}).get('token')) or request.sid != self._client:
                return {'ok': False, 'error': 'unauthorized'}
            with self._state_lock:
                snapshot = self.frame_buffer.latest()
                if snapshot is None: return {'ok': False, 'error': 'no_frame_available'}
                try:
                    mapping = manual_mapping(payload.get('grid'), snapshot.width, snapshot.height)
                except (ValueError, TypeError):
                    return {'ok': False, 'error': 'invalid_manual_geometry'}
                self.analyzer.freeze_mapping(mapping)
                self._mapping_ready = True
                response = mapping.to_jsonable()
                response.update(size=[snapshot.width, snapshot.height], mode='frozen')
                return {'ok': True, 'mapping': response}

    def _authorized_request(self) -> bool:
        token = request.headers.get("X-Keylog-Token") or request.args.get("token")
        if not token and request.is_json:
            token = (request.get_json(silent=True) or {}).get("token")
        return self.security.require_token(token)

    def _process_events(self) -> None:
        while not self._stop_event.is_set():
            try:
                generation, event = self.event_queue.get(timeout=0.2)
            except queue.Empty:
                continue

            # Wait briefly so the frame captured at press time can arrive.
            remaining = event.perf_counter_ns / 1e9 + self.analysis_wait_ms / 1000.0 - time.perf_counter()
            if remaining > 0:
                time.sleep(remaining)
            if generation != self._privacy_generation or not self._client:
                continue

            snapshot, delta_ms = self.frame_buffer.nearest_for_event(
                event,
                camera_receive_delay_ms=self.camera_receive_delay_ms,
            )
            # Empty precomputed fingertips are missing observations, not a reason
            # to rerun the tracker once per key and stall fast typing.
            result = self.analyzer.analyze(event, snapshot, frame_delta_ms=delta_ms,
                                           fingers=snapshot.fingers if snapshot else [])
            payload = result.to_jsonable()
            payload["latency"]["queue_wait_ms"] = self.analysis_wait_ms
            if generation == self._privacy_generation and self._client:
                self.socketio.emit("press_result", payload, to=self._client)

    def run(self, host: str, port: int, debug: bool = False) -> None:
        print(f"[keylog] open http://{host}:{port}")
        self.socketio.run(self.app, host=host, port=port, debug=debug, allow_unsafe_werkzeug=True)

    def close(self) -> None:
        self._stop_event.set()
        if self.observer: self.observer.stop()
        self._clear_transient()
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
    parser.add_argument("--embedded", action="store_true")
    args = parser.parse_args(argv)

    service = RealtimeAttributionService(
        camera_receive_delay_ms=args.camera_delay_ms,
        analysis_wait_ms=args.analysis_wait_ms,
        enable_global_keylogger=args.global_keylogger,
        use_mediapipe=not args.no_mediapipe,
        token=os.environ.get("MOTI_KEYBOARD_TOKEN"),
        expose_test_page=not args.embedded,
        approved_apps=json.loads(os.environ.get('MOTI_APPROVED_APPS', '[]')),
    )
    try:
        service.run(args.host, args.port)
    finally:
        service.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
