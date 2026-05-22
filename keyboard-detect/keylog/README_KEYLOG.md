# Realtime Key Finger Module

이 폴더는 기존 `src/keyboard_mapper.py` AI 모듈을 이용해서, 키 입력 순간의 카메라 프레임과 MediaPipe 손끝 좌표를 매칭하는 테스트/통합용 모듈입니다.

## 파일 역할

| 파일 | 역할 |
|---|---|
| `keylog/key_capture.py` | 명시적으로 `start()` 했을 때만 전역 키 입력을 받는 ON/OFF 모듈 |
| `keylog/frame_buffer.py` | 최근 카메라 프레임을 시간순으로 보관하고 키 입력 시각과 가장 가까운 프레임을 찾음 |
| `keylog/finger_tracker.py` | MediaPipe Hands로 엄지/검지/중지/약지/소지 끝 좌표를 이미지 픽셀로 변환 |
| `keylog/analyzer.py` | 기존 `KeyboardCoordinateMapper`와 손끝 좌표를 합쳐 "무슨 손가락이 무슨 키 위에 있었는지" 계산 |
| `keylog/service.py` | 로컬 테스트 페이지 + Socket.IO 실시간 통신 서버 |
| `keylog/templates/test_page.html` | 카메라 프레임 전송, 키 이벤트 테스트, 오버레이 확인 페이지 |
| `keylog/secure_channel.py` | 로컬 세션 토큰/HMAC 유틸 |
| `keylog/events.py` | `KeyEvent`, `FrameSnapshot`, `FingerPoint`, `PressAnalysis` 데이터 구조 |

## 실행

```powershell
pip install -r requirements.txt
python -m keylog.service
```

브라우저에서 `http://127.0.0.1:5055` 를 열면 됩니다.

테스트 페이지에는 두 가지 키 입력 경로가 있습니다.

| 경로 | 특징 |
|---|---|
| Browser key source | 페이지가 포커스된 동안만 동작합니다. 프레임과 키 입력이 둘 다 브라우저 `performance.now()` 기준이라 테스트 타이밍이 가장 안정적입니다. |
| Global keylogger | `Start global keylogger` 버튼을 눌렀을 때만 동작합니다. 다른 창 입력도 받을 수 있지만 카메라 프레임과 시계가 달라 `camera_receive_delay_ms` 보정값이 필요합니다. |

## 다른 프로그램에 넘겨줄 핵심 파일

VDT 프로젝트에 모듈로 붙일 때는 아래 파일과 기존 AI 모듈 파일을 함께 넘기면 됩니다.

| 필요 파일 | 이유 |
|---|---|
| `keylog/events.py` | 통합 프로그램과 주고받을 데이터 구조 |
| `keylog/key_capture.py` | 키 입력 ON/OFF 캡처 |
| `keylog/frame_buffer.py` | 프레임-키 이벤트 시간 매칭 |
| `keylog/finger_tracker.py` | 테스트용 또는 단독 실행용 MediaPipe 손끝 검출 |
| `keylog/analyzer.py` | 최종 판별 로직 |
| `src/keyboard_mapper.py`, `src/auto_map.py`, `src/identify_key.py` | 기존 AI 키보드 mapping 모듈 |
| `models/best.pt` | YOLO 4코너 검출 모델 |
| `data/perfect_map.json` | 기준 61키 polygon |

이미 VDT 프로젝트 안에 카메라/MediaPipe 기능이 있다면 `finger_tracker.py`는 필수가 아닙니다. 그 프로젝트에서 만든 손끝 좌표를 `FingerPoint` 리스트로 넘기고 `KeyboardPressAnalyzer.analyze(..., fingers=points)` 형태로 쓰면 됩니다.

## 최소 통합 예시

```python
import time

from keylog import FrameBuffer, FrameSnapshot, KeyEvent, KeyboardPressAnalyzer

analyzer = KeyboardPressAnalyzer()
frames = FrameBuffer(max_frames=180)

# 카메라 루프에서 계속 저장합니다. frame은 OpenCV BGR 이미지입니다.
frames.add(FrameSnapshot(
    frame=frame,
    perf_counter_ns=time.perf_counter_ns(),
    wall_time_ns=time.time_ns(),
    sequence=1,
    fingers=my_finger_points,  # 이미 MediaPipe가 있으면 여기에 넣습니다.
))

# 키 입력 콜백에서 분석합니다.
event = KeyEvent.now("Q")
snapshot, delta_ms = frames.nearest_for_event(event, camera_receive_delay_ms=80)
result = analyzer.analyze(event, snapshot, frame_delta_ms=delta_ms)

print(result.pressed_key, result.pressed_finger)
```

## 딜레이 처리 기준

정확한 "키를 누른 바로 그 순간"은 일반 웹캠만으로는 완전히 보장하기 어렵습니다. 이유는 키보드 이벤트, 카메라 노출, USB/브라우저/서버 전송, MediaPipe, YOLO 추론이 각각 다른 지점에서 시간을 기록하기 때문입니다.

이 모듈은 딜레이를 다음처럼 다룹니다.

| 딜레이 | 처리 |
|---|---|
| 키 이벤트 -> 분석 시작 | `KeyEvent.perf_counter_ns`로 즉시 기록하고 큐에 넣음 |
| 카메라 프레임 도착 지연 | 키 이벤트 후 `analysis_wait_ms`만큼 기다려 해당 시각 프레임이 도착할 시간을 줌 |
| 프레임 수신 시각과 실제 촬영 시각 차이 | `camera_receive_delay_ms` 보정값으로 조정 |
| 브라우저 테스트 페이지 | 프레임과 키 이벤트 모두 브라우저 clock을 써서 별도 clock 보정 영향을 줄임 |
| YOLO/MediaPipe 계산 시간 | 입력 순간 판정에는 직접 쓰지 않고 결과의 `latency.analysis_ms`에 기록 |

실사용에서는 처음에 `Browser key source`로 위치 판정이 맞는지 확인하고, 전역 키 입력이 필요하면 `camera_receive_delay_ms` 값을 40~140ms 범위에서 조정해 보는 것이 좋습니다.

## 보안 메모

이 모듈은 숨김 실행, 로그 파일 저장, 외부 전송을 하지 않습니다. 테스트 서버도 기본값으로 `127.0.0.1`에만 열리고 세션 토큰이 맞는 요청만 받습니다. 다만 같은 PC에서 높은 권한으로 실행되는 프로세스가 키 입력을 관찰하는 것까지 Python 모듈이 막을 수는 없습니다.
