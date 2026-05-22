"""Non-web live test for the realtime key attribution module.

Run from the copied package root:
    python keylog/examples/live_console_test.py

Press keys while the camera sees your keyboard and hands. The script prints
which visible fingertip was on the pressed key. Press ESC in the preview window
or Ctrl+C in the terminal to stop.
"""

from __future__ import annotations

import argparse
import queue
import sys
import threading
import time
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from keylog import FrameBuffer, FrameSnapshot, KeyEvent, KeyboardPressAnalyzer, RealTimeKeyLogger  # noqa: E402
from keylog.finger_tracker import MediaPipeFingerTracker  # noqa: E402
from keylog.key_capture import normalize_key_name  # noqa: E402


WINDOW_TITLE = "keylog live console test"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--camera-index", type=int, default=0)
    parser.add_argument("--camera-delay-ms", type=float, default=80.0)
    parser.add_argument("--analysis-wait-ms", type=float, default=120.0)
    parser.add_argument("--map-debug-interval-ms", type=float, default=1000.0)
    parser.add_argument("--no-global-keylogger", action="store_true")
    parser.add_argument("--no-opencv-key-source", action="store_true")
    parser.add_argument("--no-preview", action="store_true")
    args = parser.parse_args()

    capture = cv2.VideoCapture(args.camera_index, cv2.CAP_DSHOW)
    if not capture.isOpened():
        raise RuntimeError(f"could not open camera index {args.camera_index}")

    frame_buffer = FrameBuffer(max_frames=180)
    event_queue: "queue.Queue" = queue.Queue()
    stop_event = threading.Event()
    tracker = MediaPipeFingerTracker()
    analyzer = KeyboardPressAnalyzer(finger_tracker=None)

    def on_key_event(event) -> None:
        print(f"[key event] {event.key} source={event.source}")
        event_queue.put(event)

    keylogger = RealTimeKeyLogger(on_event=on_key_event)

    def worker() -> None:
        while not stop_event.is_set():
            try:
                event = event_queue.get(timeout=0.2)
            except queue.Empty:
                continue

            if args.analysis_wait_ms > 0:
                time.sleep(args.analysis_wait_ms / 1000.0)

            snapshot, delta_ms = frame_buffer.nearest_for_event(
                event,
                camera_receive_delay_ms=args.camera_delay_ms,
            )
            result = analyzer.analyze(event, snapshot, frame_delta_ms=delta_ms)
            if result.pressed_finger:
                finger = result.pressed_finger
                print(
                    f"[{result.pressed_key}] {finger['hand']} {finger['finger']} "
                    f"on {finger.get('key')} | delta={_fmt(result.frame_delta_ms)}ms "
                    f"analysis={_fmt(result.latency.get('analysis_ms'))}ms"
                )
            else:
                print(
                    f"[{event.key}] no match | error={result.error} "
                    f"keyboard={result.keyboard_reason} delta={_fmt(result.frame_delta_ms)}ms"
                )

    worker_thread = threading.Thread(target=worker, daemon=True)
    worker_thread.start()
    if not args.no_global_keylogger:
        keylogger.start()
        print("Global key capture started.")
    else:
        print("Global key capture disabled.")
    print("Press keys while the preview is open. ESC in the preview window stops the test.")
    print("If [key event] appears but keyboard=missing_corners/low_confidence appears, it is a camera/model mapping issue.")

    sequence = 0
    last_map_debug_ns = 0
    last_map_status = None
    last_mapping_result = None

    def on_mouse(event, x, y, flags, param) -> None:
        nonlocal last_mapping_result
        if event == cv2.EVENT_LBUTTONDOWN:
            if analyzer.frozen:
                analyzer.unfreeze_mapping()
                print("[mapping] unfrozen; live mapping resumed")
                return
            if analyzer.freeze_mapping(last_mapping_result):
                frozen = analyzer.current_mapping()
                count = len(frozen.keys) if frozen else 0
                print(f"[mapping] frozen keys={count}; left/right click to unfreeze")
            else:
                print("[mapping] freeze failed; wait until '[map debug] keyboard ok keys=61'")
        elif event == cv2.EVENT_RBUTTONDOWN:
            analyzer.unfreeze_mapping()
            print("[mapping] unfrozen; live mapping resumed")

    if not args.no_preview:
        cv2.namedWindow(WINDOW_TITLE)
        cv2.setMouseCallback(WINDOW_TITLE, on_mouse)

    try:
        while not stop_event.is_set():
            ok, frame = capture.read()
            if not ok:
                time.sleep(0.01)
                continue

            sequence += 1
            fingers = tracker.detect(frame)
            snapshot = FrameSnapshot(
                frame=frame,
                perf_counter_ns=time.perf_counter_ns(),
                wall_time_ns=time.time_ns(),
                sequence=sequence,
                fingers=fingers,
            )
            frame_buffer.add(snapshot)

            now_ns = time.perf_counter_ns()
            if args.map_debug_interval_ms > 0 and (
                now_ns - last_map_debug_ns >= args.map_debug_interval_ms * 1_000_000
            ):
                last_map_debug_ns = now_ns
                if analyzer.frozen:
                    last_mapping_result = analyzer.current_mapping()
                    status = f"keyboard frozen keys={len(last_mapping_result.keys)}"
                else:
                    last_mapping_result = analyzer.map_keyboard(frame)
                    if last_mapping_result.ok:
                        status = f"keyboard ok keys={len(last_mapping_result.keys)}"
                    else:
                        status = (
                            f"keyboard fail reason={last_mapping_result.reason} "
                            f"missing={last_mapping_result.missing}"
                        )
                if status != last_map_status:
                    print("[map debug]", status)
                    last_map_status = status

            if not args.no_preview:
                display_mapping = analyzer.current_mapping() if analyzer.frozen else last_mapping_result
                if display_mapping is not None:
                    preview = analyzer.mapper.draw_overlay(frame, display_mapping)
                else:
                    preview = frame.copy()
                _draw_fingers(preview, fingers)
                mode = "FROZEN" if analyzer.frozen else "LIVE"
                cv2.putText(
                    preview,
                    f"{mode} frames={len(frame_buffer)} fingers={len(fingers)} {last_map_status or ''}",
                    (12, 28),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.75,
                    (40, 240, 120),
                    2,
                    cv2.LINE_AA,
                )
                cv2.putText(
                    preview,
                    "Left click: freeze/unfreeze mapping | Right click: unfreeze | ESC: quit",
                    (12, preview.shape[0] - 16),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.55,
                    (255, 255, 255),
                    2,
                    cv2.LINE_AA,
                )
                cv2.imshow(WINDOW_TITLE, preview)
                key_code = cv2.waitKey(1) & 0xFF
                if key_code == 27:
                    break
                if key_code not in (255, 0xFF) and not args.no_opencv_key_source:
                    key_char = chr(key_code)
                    on_key_event(
                        KeyEvent.now(
                            normalize_key_name(key_char),
                            source="opencv_preview",
                        )
                    )
    except KeyboardInterrupt:
        pass
    finally:
        stop_event.set()
        keylogger.stop()
        tracker.close()
        capture.release()
        cv2.destroyAllWindows()

    return 0


def _draw_fingers(frame, fingers) -> None:
    for point in fingers:
        x, y = int(point.x), int(point.y)
        cv2.circle(frame, (x, y), 7, (0, 220, 255), -1)
        cv2.putText(
            frame,
            f"{point.hand} {point.finger}",
            (x + 9, y - 8),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (0, 220, 255),
            1,
            cv2.LINE_AA,
        )


def _fmt(value) -> str:
    return "-" if value is None else f"{float(value):.1f}"


if __name__ == "__main__":
    raise SystemExit(main())
