# [최종] 상체 자세 모니터링 통합 설계 사양서 및 개발 프롬프트

## 1. 제품 모드 및 점수 아키텍처 확정안

### 1) 단일 통합 모드 (One Mode)
* 기존의 `turtle`(거북목), `shoulder`(어깨) 분리 모드를 폐기하고, **"상체 자세 모니터링 (Upper Body Posture)" 단일 모드**로 통합합니다.
* 사용자는 버튼 한 번으로 측정을 시작하며, 웹캠 1대로 목과 어깨를 동시에 분석합니다.

### 2) 독립 점수 산출 및 병렬 표시 (Dual Independent Scores)
* 두 부위의 점수를 억지로 가중합(종합 점수)하지 않고, **목 점수**와 **어깨 점수**를 각각 100점 만점으로 독립 계산하여 화면에 나란히 제공합니다.
* **목 점수 (`neckScore`)**: 0 ~ 100점 (거북목, 상체 전방 쏠림, 고개 돌림 방어)
* **어깨 점수 (`shoulderScore`)**: 0 ~ 100점 (좌우 비대칭 기울기, 승모근 긴장 으쓱임)

---

## 2. 부위별 세부 측정 지표 및 계산 로직

### A. 거북목 독립 점수 (`neckScore`: 100점 만점)

#### 1) 랜드마크 기준점 변경
* 코(0번) 단독 추적을 전면 배제하고, 머리 회전축에 위치한 **양쪽 귀(7, 8번)의 중점**을 머리의 기준 좌표로 삼습니다.
  $$\text{earCenterX} = \frac{\text{leftEar.x} + \text{rightEar.x}}{2}, \quad \text{earCenterY} = \frac{\text{leftEar.y} + \text{rightEar.y}}{2}$$

#### 2) 고개 돌림(Yaw) 감지 및 방어
* 코가 양 귀의 중심선에서 얼마나 벗어났는지를 비율로 추정:
  $$\text{earSpan} = |\text{rightEar.x} - \text{leftEar.x}|$$
  $$\text{yawRatio} = \frac{|\text{nose.x} - \text{earCenterX}|}{\text{earSpan}}$$
* **판정**: $\text{yawRatio} > 0.15$ 이면 고개를 옆으로 돌린 상태로 판정.
  * 고개를 돌릴 때 귀 사이 거리가 투영상 좁아지는 현상으로 인한 오작동을 방지하기 위해, **고개 돌림 상태에서는 전진 지표의 감점을 일시 동결하거나 가중치를 0으로 처리**합니다.

#### 3) 전방 쏠림 및 거북목 지표 (원근 크기 변화)
* 초기 캘리브레이션 시 기준값 저장: `baseEarSpanPx`, `baseShoulderSpanPx`, `baseEarHeightPx`
* **머리 전진 편차 ($\Delta_{\text{head}}$)**:
  $$\Delta_{\text{head}} = \max\left(0, \frac{\text{currentEarSpan} - \text{baseEarSpan}}{\text{baseEarSpan}}\right)$$
  *(단, $\text{yawRatio} \le 0.15$일 때만 유효하게 반영)*
* **상체(어깨) 전방 쏠림 편차 ($\Delta_{\text{torso}}$)**:
  $$\Delta_{\text{torso}} = \max\left(0, \frac{\text{currentShoulderSpan} - \text{baseShoulderSpan}}{\text{baseShoulderSpan}}\right)$$
* **귀-어깨 수직 처짐 편차 ($\Delta_{\text{neckSlump}}$)**:
  $$\text{currentEarHeight} = \text{shoulderCenterY} - \text{earCenterY}$$
  $$\Delta_{\text{neckSlump}} = \max\left(0, \frac{\text{baseEarHeight} - \text{currentEarHeight}}{\text{baseShoulderSpan}}\right)$$

#### 4) 목 최종 편차 및 점수 환산
$$\text{deviation}_{\text{neck}} = w_1 \cdot \Delta_{\text{head}} + w_2 \cdot \Delta_{\text{torso}} + w_3 \cdot \Delta_{\text{neckSlump}}$$
$$\text{neckScore} = \text{LinearInterpolate}(\text{deviation}_{\text{neck}}, \text{fullCredit: 0.08}, \text{zeroCredit: 0.30})$$

---

### B. 어깨 독립 점수 (`shoulderScore`: 100점 만점)

실증 테스트 결과, 정면 2D에서 어깨 가로폭 변화(2~3%)로는 어깨 말림을 신뢰성 있게 판별하기 어려우므로(이는 위 목/상체 전방 쏠림 지표로 자연스럽게 흡수됨), **어깨 점수는 정면 2D에서 가장 명확하고 정확한 2가지 지표에 집중**합니다.

#### 1) 좌우 비대칭 기울기 편차 ($\Delta_{\text{tilt}}$)
* 한쪽 팔걸이에 기대거나 척추가 휘어 한쪽 어깨만 올라간 상태 감지:
  $$\Delta_{\text{tilt}} = \frac{|\text{leftShoulder.y} - \text{rightShoulder.y}| \times \text{heightPx}}{\text{shoulderSpanPx}}$$

#### 2) 어깨 치켜올림 / 으쓱임 편차 ($\Delta_{\text{shrug}}$)
* 승모근 긴장으로 인해 어깨를 귀 쪽으로 치켜올리는 긴장 상태 감지:
  $$\text{currentShoulderHeight} = \text{shoulderCenterY} - \text{earCenterY}$$
  $$\Delta_{\text{shrug}} = \max\left(0, \frac{\text{baseEarHeight} - \text{currentShoulderHeight}}{\text{baseShoulderSpan}}\right)$$

#### 3) 어깨 최종 편차 및 점수 환산
$$\text{deviation}_{\text{shoulder}} = w_{\text{tilt}} \cdot \Delta_{\text{tilt}} + w_{\text{shrug}} \cdot \Delta_{\text{shrug}}$$
$$\text{shoulderScore} = \text{LinearInterpolate}(\text{deviation}_{\text{shoulder}}, \text{fullCredit: 0.05}, \text{zeroCredit: 0.25})$$

---

## 3. 동적 움직임 및 스트레칭(7~10초) 보호 공통 로직

사용자가 기지개를 켜거나 자세를 고쳐앉는 7~10초 동안 점수가 바닥으로 떨어지는 문제를 해결하기 위해 **방법 1과 방법 2를 결합 적용**합니다.

### 1) 방법 1: 관절 속도(Velocity) 기반 상태 감지
* 연속 프레임 간 주요 랜드마크(어깨, 귀)의 유클리드 이동 속도 $V$를 계산:
  $$V = \frac{\sqrt{(\Delta x \cdot \text{width})^2 + (\Delta y \cdot \text{height})^2}}{\Delta t}$$
* $V > V_{\text{dynamic}}$ 이면 시스템 상태를 **`isStretching / isTransitioning`**으로 즉시 전환.
* **동작**: 움직임이 진행되는 동안에는 점수 감점을 중단하고 **이전 정상 점수를 동결(Freeze)**합니다.

### 2) 방법 2: 5초 유예 시간 (Grace Period)
* 자세가 허용 임계값을 벗어났더라도(자세 흐트러짐 감지), 즉시 1프레임 만에 감점하지 않고 **5초 타이머**를 시작합니다.
* 5초 이내에 다시 바른 자세로 복귀하면 $\rightarrow$ **감점 0점 (평균 점수 오염 방지)**.
* 5초 이상 나쁜 자세가 정적으로 굳어질 때만 $\rightarrow$ **그때부터 점수를 점진적으로 감점**합니다.

---

## 4. 최종 개정된 개발 프롬프트 (Copy & Paste용)

다른 세션이나 차후 구현 작업 시 AI 에이전트 또는 개발자에게 그대로 전달하여 작업할 수 있도록 작성된 완성형 프롬프트입니다.

```markdown
# 작업 목표: Moti 상체(거북목·어깨) 단일 모드 통합 및 독립 점수 알고리즘 개편

## 1. 아키텍처 개편 (`modes/`, `monitorTypes.ts`, `PostureSession.tsx`)
- 기존 `turtle`, `shoulder` 분리 모드를 폐기하고, 단일 모드 `upper_body`로 통합.
- 웹캠 1대로 관측하되, 점수는 종합 가중합 대신 2개의 독립 점수로 산출하여 화면에 병렬 표시:
  - `neckScore`: 목 자세 점수 (0~100점)
  - `shoulderScore`: 어깨 균형 점수 (0~100점)

## 2. 거북목 점수 알고리즘 (`calibration.ts`, `observation.ts`, `scoring.ts`)
- 코(0번) 단독 추적을 제거하고, 양쪽 귀(7, 8번)의 중점 `(leftEar + rightEar) / 2`을 머리 기준 좌표로 설정.
- 고개 돌림(Yaw) 방어:
  - `yawRatio = abs(nose.x - earCenterX) / earSpan`
  - `yawRatio > 0.15`인 경우 고개 회전으로 판정하여 귀 거리 감소로 인한 왜곡을 방지 (전진 지표 감점 스킵 또는 가중치 0).
- 전방 쏠림(원근 크기 변화) 지표:
  - 초기 캘리브레이션 시 `baseEarSpanPx`, `baseShoulderSpanPx`, `baseEarHeightPx` 저장.
  - 관측 시 초기 대비 머리 전진(`headForward`), 상체 전진(`torsoForward`), 목 처짐(`neckSlump`)을 계산하여 가중합으로 `neckScore` 산출.

## 3. 어깨 점수 알고리즘 (`calibration.ts`, `scoring.ts`)
- 정면 2D 특성상 신뢰성이 떨어지는 가로폭 기반 어깨 말림은 제외하고, 정면에서 가장 확실한 2가지 지표에 집중:
  1. 좌우 비대칭 기울기 (`shoulderTilt`): 양 어깨 높낮이 차이
  2. 승모근 긴장 으쓱임 (`shoulderShrug`): 귀-어깨 수직 거리가 비정상적으로 좁아진 정도
- 두 지표를 바탕으로 100점 만점의 독립된 `shoulderScore` 산출.

## 4. 스트레칭 및 동적 움직임(7~10초) 보호 로직 (`evaluation.ts`)
- 극단값 선택 함수인 `Math.max`를 전면 제거하고 가중합 구조로 전환.
- 속도 기반 동적 감지: 프레임 간 관절 이동 속도가 빠를 경우 `isTransitioning` 상태로 간주하여 점수 감점을 일시 동결.
- 5초 유예 시간(Grace Period): 기준치 이탈 시 즉각 감점하지 않고 5초간 대기 후, 나쁜 자세가 정적으로 지속될 때만 점진적 감점 적용 (스트레칭 중 평균 점수 급락 방지).
```
