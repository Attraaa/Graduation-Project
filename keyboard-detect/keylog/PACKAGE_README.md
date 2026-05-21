# Keyboard Detect Runtime Package

이 패키지는 웹 프로젝트 전용이 아닙니다. `keylog`의 핵심 모듈은 Python 코드에서 직접 import해서 쓰는 구조이고, `service.py`와 `templates/`는 브라우저로 빠르게 확인하기 위한 선택형 테스트 도구입니다.

## 통합에 필요한 핵심 흐름

1. 카메라 루프에서 `FrameSnapshot`을 계속 `FrameBuffer`에 넣습니다.
2. 키 입력 콜백에서 `KeyEvent`를 만듭니다.
3. `FrameBuffer.nearest_for_event()`로 키 입력 시각에 가장 가까운 프레임을 고릅니다.
4. `KeyboardPressAnalyzer.analyze()`에 키 이벤트와 프레임을 넣습니다.
5. 결과의 `pressed_key`, `pressed_finger`, `finger_keys`를 VDT 프로젝트 로직으로 넘깁니다.

Electron 같은 데스크톱 앱에서는 JS/Electron 쪽에서 키 이벤트와 카메라/MediaPipe 결과를 얻은 뒤 Python 모듈에 IPC로 넘겨도 되고, Python 프로세스가 카메라/키 입력을 직접 맡고 앱이 결과만 받아도 됩니다.

## 폴더 구성

| 경로 | 역할 |
|---|---|
| `keylog/` | 실시간 키 입력-프레임-손끝 매칭 모듈 |
| `keylog/examples/live_console_test.py` | 웹 없이 OpenCV 창으로 테스트하는 예제 |
| `keylog/service.py` | 선택형 웹 테스트 서버 |
| `src/keyboard_mapper.py` | 기존 AI 모듈 메인 |
| `src/auto_map.py` | YOLO 코너 검출, homography |
| `src/identify_key.py` | 좌표가 어떤 key polygon 안인지 판별 |
| `models/best.pt` | YOLO 4코너 검출 모델 |
| `data/perfect_map.json` | 기준 키보드 61키 좌표 |
| `requirements.txt` | 실행 의존성 |

## 설치

```powershell
cd "D:\keyboard detect"
python -m pip install -r requirements.txt
```

## 웹 없이 테스트

```powershell
cd "D:\keyboard detect"
python keylog\examples\live_console_test.py
```

카메라 창이 뜨면 키보드와 손이 보이게 두고 키를 누릅니다. 터미널에 예를 들어 아래처럼 출력됩니다.

```text
[Q] Right index on Q | delta=12.4ms analysis=87.3ms
```

미리보기에서 키보드 매핑이 `keyboard ok keys=61`로 잡히면, 창을 왼쪽 클릭해서 현재 매핑을 고정할 수 있습니다. 고정 중에는 손이 코너 키를 가려도 저장된 키 polygon을 계속 사용합니다.

| 동작 | 기능 |
|---|---|
| 왼쪽 클릭 | 좋은 매핑이 있을 때 고정, 고정 중이면 해제 |
| 오른쪽 클릭 | 고정 해제 |
| ESC | 종료 |

주의: 고정 매핑은 카메라와 키보드 위치가 그대로일 때만 정확합니다. 카메라 각도나 키보드 위치가 바뀌면 고정을 풀고 다시 잡아야 합니다.

카메라가 여러 개면:

```powershell
python keylog\examples\live_console_test.py --camera-index 1
```

프레임 타이밍이 밀리면:

```powershell
python keylog\examples\live_console_test.py --camera-delay-ms 60 --analysis-wait-ms 100
```

## 안 잡힐 때 확인 순서

실행 중 터미널에 다음 두 종류의 메시지가 나옵니다.

```text
[key event] Q source=global
[map debug] keyboard ok keys=61
```

| 증상 | 의미 | 조치 |
|---|---|---|
| `[key event]`가 안 나옴 | 전역 키 입력 캡처가 안 들어옴 | 미리보기 창을 클릭한 뒤 다시 눌러보세요. 그래도 안 되면 `--no-global-keylogger` 없이 관리자 권한 터미널에서 실행해보세요. |
| `[key event]`는 나오지만 `keyboard fail reason=missing_corners` | YOLO가 `~`, `Backspace`, `L-Ctrl`, `R-Ctrl` 네 코너 중 일부를 못 봄 | 카메라에 키보드 전체, 특히 네 코너 키가 모두 보이게 하고 조명/초점을 맞춥니다. |
| `keyboard fail reason=low_confidence` | 네 코너를 봤지만 신뢰도가 낮음 | 카메라를 가까이 하거나 흔들림/반사를 줄입니다. |
| `keyboard ok keys=61`인데 손가락 매칭이 안 됨 | 손끝 검출 또는 타이밍 문제 | 손이 카메라에 잘 보이게 하고 `--camera-delay-ms`, `--analysis-wait-ms` 값을 조정합니다. |

키 입력 캡처만 먼저 보고 싶으면 OpenCV 미리보기 창을 클릭한 상태에서 키를 누르세요. 이때는 전역 키로거가 실패해도 `source=opencv_preview` 이벤트가 들어옵니다.

## 선택형 웹 테스트

웹 기반 프로젝트로 쓰라는 뜻이 아니라, 오버레이를 빠르게 확인하기 위한 테스트 도구입니다.

```powershell
cd "D:\keyboard detect"
python -m keylog.service
```

브라우저에서 `http://127.0.0.1:5055`를 엽니다.

## 최소 코드 예시

```python
import time
from keylog import FrameBuffer, FrameSnapshot, KeyEvent, KeyboardPressAnalyzer

frames = FrameBuffer(max_frames=180)
analyzer = KeyboardPressAnalyzer()

# 카메라 루프
frames.add(FrameSnapshot(
    frame=frame_bgr,
    perf_counter_ns=time.perf_counter_ns(),
    wall_time_ns=time.time_ns(),
    sequence=frame_no,
    fingers=finger_points,  # 이미 MediaPipe가 있으면 여기에 넣습니다.
))

# 키 입력 콜백
event = KeyEvent.now("Q")
snapshot, delta_ms = frames.nearest_for_event(event, camera_receive_delay_ms=80)
result = analyzer.analyze(event, snapshot, frame_delta_ms=delta_ms)

print(result.pressed_key, result.pressed_finger)
```

## 코드에서 매핑 고정 사용

```python
# 라이브 프레임에서 좋은 매핑을 얻었을 때
mapping = analyzer.map_keyboard(frame_bgr)
if mapping.ok:
    analyzer.freeze_mapping(mapping)

# 이후 analyze()는 frozen mapping을 우선 사용합니다.
result = analyzer.analyze(event, snapshot, frame_delta_ms=delta_ms)

# 키보드/카메라 위치가 바뀌면
analyzer.unfreeze_mapping()
```
