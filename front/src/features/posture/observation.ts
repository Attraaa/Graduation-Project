import { DEFAULT_CALIBRATION_OPTIONS, extractFrontalMeasurement } from './calibration.ts';
import type { CalibrationFrame, CalibrationReason, CalibrationReference, FrontalMeasurement } from './calibration.ts';
import { YAW_LIMIT } from './scoreSettings.ts';

/**
 * [역할: 카메라 좌표를 비교 가능한 변화량으로 바꾸기]
 * 입력: 이번 프레임의 코·귀·어깨 좌표 + 세션 시작 때 수집한 기준(reference).
 * 출력: 변화량(delta), 움직임 속도, 실제로 관찰한 시간. 점수는 아직 계산하지 않습니다.
 * 한 프레임은 카메라에서 전달된 한 시점의 관측 결과입니다.
 */
export interface PostureDeltas {
  // 기준보다 화면상 귀 수평 폭이 커진 비율. 실제 목 전진 거리 자체는 아닙니다.
  headForward: number;
  // 기준보다 화면상 양어깨 거리가 커진 비율.
  torsoForward: number;
  // 기준보다 귀-어깨 수직 간격이 줄어든 양 / 기준 어깨 폭.
  neckSlump: number;
  // 현재 양어깨의 높이 차이 / 현재 어깨 폭. 기준 기울기를 빼는 값은 아닙니다.
  shoulderTilt: number;
  // 귀-어깨 수직 간격이 기준과 달라진 양의 절댓값 / 기준 어깨 폭.
  shoulderShrug: number;
  // 코의 좌우 치우침 / 귀 폭. 회전 판정 보류에 사용하는 비율입니다.
  yawRatio: number;
}

export interface ObservationState {
  // 유효한 연속 프레임 사이의 누적 시간(초). 앱을 켜 둔 전체 시간과 다릅니다.
  observedSeconds: number;
  // 마지막으로 처리한 시각과 마지막으로 유효했던 시각을 따로 기억합니다.
  lastTimestampMs: number | null;
  lastValidAtMs: number | null;
  reference: CalibrationReference | null;
  // null = 측정 불가, 각 항목의 0 = 유효하게 측정했지만 해당 변화가 없음.
  delta: PostureDeltas | null;
  // 이번 좌표를 픽셀·비율로 계산한 결과. 다음 프레임의 속도 계산에도 사용합니다.
  measurement: FrontalMeasurement | null;
  velocityPxPerSecond: number | null;
  // 측정 불가 이유. 화면에서 정면·조명·카메라 안내를 고르는 데 사용합니다.
  reason: CalibrationReason | null;
}

/** 새 세션의 관측 상태를 만듭니다. 아직 측정하지 않았으므로 값은 null입니다. */
export function createObservation(): ObservationState {
  return { observedSeconds: 0, lastTimestampMs: null, lastValidAtMs: null, reference: null, delta: null, measurement: null, velocityPxPerSecond: null, reason: null };
}

/** 누락 시 현재 값과 연속 연결만 끊습니다. 이미 관찰한 누적 시간은 보존합니다. */
export function interruptObservation(previous: ObservationState): ObservationState {
  return { ...previous, lastValidAtMs: null, delta: null, measurement: null, velocityPxPerSecond: null, reason: 'interrupted' };
}

/** 프레임이 들어올 때마다 이전 상태를 읽고 새 상태를 반환합니다. 이전 객체를 직접 바꾸지 않습니다. */
export function advanceObservation(
  previous: ObservationState,
  reference: CalibrationReference | null,
  frame: CalibrationFrame,
): ObservationState {
  const { timestampMs } = frame;
  // 우선 현재 값을 비웁니다. 아래 검사를 모두 통과해야 다시 유효한 값을 채웁니다.
  const cleared = { ...interruptObservation(previous), reference };
  if (!Number.isFinite(timestampMs) || timestampMs < 0
    || (previous.lastTimestampMs !== null && timestampMs <= previous.lastTimestampMs)) {
    // 중복·역행 프레임은 제외합니다. 마지막 시각을 되돌리지 않아 시간을 중복 가산하지 않습니다.
    return { ...cleared, reason: 'invalid-time' };
  }
  const next = { ...cleared, lastTimestampMs: timestampMs };
  // calibration.ts의 공통 함수가 좌표·가시성을 검사하고 픽셀 거리/비율을 계산합니다.
  const current = extractFrontalMeasurement(frame);
  if (!current.valid) return { ...next, reason: current.reason };
  if (!reference) return { ...next, reason: null };
  if (reference.sourceId !== frame.sourceId || reference.widthPx !== frame.widthPx || reference.heightPx !== frame.heightPx) {
    return { ...next, reason: 'camera-changed' };
  }
  if (timestampMs < reference.completedAtMs) return { ...next, reason: 'invalid-time' };
  // 회전 중에는 delta를 만들지 않습니다. 회전 진입·복귀를 가로지르는 시간도 연결하지 않습니다.
  if (current.measurement.yawRatio > YAW_LIMIT) return { ...next, reason: 'head-turned' };

  // 같은 기준에서, 연속된 유효 관측 사이 간격이 500ms 이하일 때만 시간을 더합니다.
  // 첫 프레임·누락 후 첫 프레임·긴 공백은 비교할 연결 구간이 없어 0초를 더합니다.
  const sameReference = previous.reference?.completedAtMs === reference.completedAtMs
    && previous.reference.sourceId === reference.sourceId
    && previous.reference.widthPx === reference.widthPx && previous.reference.heightPx === reference.heightPx;
  const gapMs = previous.lastValidAtMs === null ? null : timestampMs - previous.lastValidAtMs;
  const addedSeconds = sameReference && gapMs !== null && gapMs <= DEFAULT_CALIBRATION_OPTIONS.maxGapMs
    ? gapMs / 1000 : 0;
  const measurement = current.measurement;
  // 간격 감소는 양수, 간격 증가는 음수입니다. 기준 어깨 폭으로 나눠 비율로 만듭니다.
  // 예: 기준 어깨 폭 500px, 귀-어깨 간격 감소 50px → heightChange = 0.1.
  const heightChange = (reference.baseEarHeightPx - measurement.earHeightPx) / reference.baseShoulderSpanPx;
  // 양 귀·양어깨 4점 각각의 이동 거리 / 시간 중 가장 큰 속도를 사용합니다.
  // Math.hypot은 가로·세로 이동을 합친 거리입니다. 누락 구간을 건너뛴 속도는 만들지 않습니다.
  const velocityPxPerSecond = addedSeconds > 0 && previous.measurement
    ? Math.max(...measurement.motionPoints.map((point, index) => {
      const last = previous.measurement!.motionPoints[index];
      return Math.hypot(point.x - last.x, point.y - last.y) / addedSeconds;
    })) : null;
  return {
    ...next,
    observedSeconds: previous.observedSeconds + addedSeconds,
    lastValidAtMs: timestampMs,
    reason: null,
    measurement, velocityPxPerSecond,
    delta: {
      // Math.max(0, 값): 폭이 줄어드는 반대 방향 변화는 0으로 제한합니다.
      headForward: Math.max(0, (measurement.earSpanPx - reference.baseEarSpanPx) / reference.baseEarSpanPx),
      torsoForward: Math.max(0, (measurement.shoulderSpanPx - reference.baseShoulderSpanPx) / reference.baseShoulderSpanPx),
      neckSlump: Math.max(0, heightChange),
      shoulderTilt: Math.abs(measurement.shoulderHeightDifferenceShoulderWidths),
      // Math.abs는 부호를 없앱니다. 어깨는 간격 증가·감소를 모두 반영합니다.
      // 귀를 기준으로 하므로 머리의 상하 움직임도 이 값에 영향을 줄 수 있습니다.
      shoulderShrug: Math.abs(heightChange),
      yawRatio: measurement.yawRatio,
    },
  };
}
