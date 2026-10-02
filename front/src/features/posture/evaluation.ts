import { DEFAULT_CALIBRATION_OPTIONS } from './calibration.ts';
import type { ObservationState } from './observation.ts';
import { scorePosture } from './scoring.ts';
import type { ScorePolicy } from './scoring.ts';
import { MOTION_PROTECTION } from './scoreSettings.ts';

/**
 * [역할: 원점수에 시간 규칙을 적용하고 세션 결과를 누적]
 * 매 관측마다 scoring.ts를 호출한 뒤 움직임 동결·감점 유예·복귀 확인을 적용합니다.
 * 목과 어깨는 이 함수를 각각 호출하고, 각자 별도의 상태와 평균을 가집니다.
 * 실제 DB 쓰기는 이 파일 밖의 기록 모듈이 담당합니다.
 */

// "지속된 기준 이탈" 횟수/시간에만 사용하는 규칙입니다. 점수 감점 유예와 별도입니다.
// 가중 편차 0.15 이상이 2초 이어지면 1회 확정, 이후 0.10 이하이면 해당 이탈 구간 종료.
// 진입·종료 기준을 다르게 두어 경계에서 흔들릴 때 횟수가 반복 증가하지 않게 합니다.
export const HABIT_POLICY = Object.freeze({
  version: 'weighted-reference-deviation-v3',
  enterDelta: 0.15,
  exitDelta: 0.10,
  minDurationMs: 2000,
});

export interface EvaluationState {
  // 어떤 점수/습관 규칙으로 계산했는지 구분하는 ID입니다.
  scorePolicyVersion: string;
  habitPolicyVersion: string;
  // 화면에 표시할 보호 적용 점수, 가중 편차, 세션 평균. null은 판정/평균 불가입니다.
  currentScore: number | null;
  currentDeviation: number | null;
  averageScore: number | null;
  // 시간은 여기서 밀리초(ms)로 누적합니다. 1000ms = 1초입니다.
  // validMs: 점수 평균에 포함된 시간 / continuousMs: 현재 연속 관찰 시간.
  validMs: number;
  continuousMs: number;
  longestContinuousMs: number;
  // 2초 이상 지속돼 확정한 이탈 횟수와, 확정 후 이어진 이탈 시간입니다.
  deviationEpisodeCount: number;
  deviationMs: number;
  // unknown: 미확인 / near-reference: 진입 기준 아래 / pending: 2초 확인 중 / away: 확정된 이탈.
  deviationState: 'unknown' | 'near-reference' | 'pending' | 'away';
  // 마지막 관측 누적 시간을 기억해 이번에 새로 늘어난 시간만 계산합니다.
  lastObservedSeconds: number;
  // 평균용 누적값 = 점수 × 시간의 합. 이를 validMs로 나누면 averageScore입니다.
  scoreTimeSum: number;
  // 습관의 "이탈 1회"를 확정하기까지 쌓인 시간. 감점 유예 타이머와 다릅니다.
  pendingMs: number;
  // none: 일반 / moving: 움직임 동결 / grace: 감점 유예 / recovering: 100점 복귀 확인.
  protection: 'none' | 'moving' | 'grace' | 'recovering';
  // 정지한 상태에서 원점수가 100 미만인 상태가 연속된 시간. 2초 유예에 사용합니다.
  staticDeviationMs: number;
  // scoring.ts가 계산한 보호 적용 전 점수.
  rawScore: number | null;
  // 판정 불가 구간에도 내부에 남겨 두는 마지막 표시 점수. 그 구간에 표시하거나 평균내지는 않습니다.
  lastScore: number | null;
  // 낮아진 점수의 100점 복귀를 인정하기 위해 허용 범위가 연속된 시간.
  nearReferenceMs: number;
}

/** 새 세션의 빈 상태입니다. 아직 측정하지 않았으므로 처음부터 100점을 넣지 않습니다. */
export function createEvaluation(policy: ScorePolicy): EvaluationState {
  return {
    scorePolicyVersion: policy.version,
    habitPolicyVersion: HABIT_POLICY.version,
    currentScore: null,
    currentDeviation: null,
    averageScore: null,
    validMs: 0,
    continuousMs: 0,
    longestContinuousMs: 0,
    deviationEpisodeCount: 0,
    deviationMs: 0,
    deviationState: 'unknown',
    lastObservedSeconds: 0,
    scoreTimeSum: 0,
    pendingMs: 0,
    protection: 'none', staticDeviationMs: 0, rawScore: null,
    lastScore: null, nearReferenceMs: 0,
  };
}

/** 누락 시 현재 표시와 연속 타이머를 비웁니다. 평균·누적 통계·lastScore는 보존합니다. */
export function interruptEvaluation(previous: EvaluationState): EvaluationState {
  return {
    ...previous,
    currentScore: null,
    currentDeviation: null,
    continuousMs: 0,
    deviationState: 'unknown',
    pendingMs: 0,
    protection: 'none', staticDeviationMs: 0, rawScore: null, nearReferenceMs: 0,
  };
}

/** 매 프레임의 observation 결과를 한 번씩 처리합니다. 화면 갱신보다 먼저 계산·누적합니다. */
export function advanceEvaluation(
  previous: EvaluationState,
  observation: ObservationState,
  policy: ScorePolicy,
): EvaluationState {
  // 규칙 버전이 달라졌으면 새 상태로 시작해 서로 다른 규칙의 평균을 섞지 않습니다.
  const base = previous.scorePolicyVersion === policy.version && previous.habitPolicyVersion === HABIT_POLICY.version
    ? previous : createEvaluation(policy);
  const current = scorePosture(observation.delta, policy);
  // 이번 상태를 만들고 원점수부터 넣습니다. 아래 보호 규칙이 currentScore를 조정할 수 있습니다.
  const next: EvaluationState = {
    ...interruptEvaluation(base),
    currentScore: current.score,
    currentDeviation: current.deviation,
    rawScore: current.score,
    lastObservedSeconds: observation.observedSeconds,
  };
  const elapsedMs = (observation.observedSeconds - base.lastObservedSeconds) * 1000;
  // 소수 시간 계산의 아주 작은 오차 때문에 정확히 500ms/1초/2초인 경계를 넘지 않게 합니다.
  const roundingMs = Number.EPSILON * Math.max(1, observation.observedSeconds, base.lastObservedSeconds) * 4000;
  const connected = base.currentScore !== null && current.score !== null && elapsedMs > 0
    && elapsedMs <= DEFAULT_CALIBRATION_OPTIONS.maxGapMs + roundingMs;
  // 회전·가림 등 판정 불가이면 현재 점수는 null이며, 이번 시간/평균을 더하지 않고 종료합니다.
  if (current.score === null) return next;
  // 유지할 점수는 마지막 표시 점수입니다. 측정 이력이 처음이면 실제 원점수를 사용합니다.
  const held = base.lastScore ?? current.score;
  const moving = observation.velocityPxPerSecond !== null
    && observation.velocityPxPerSecond > MOTION_PROTECTION.velocityPxPerSecond;
  if (moving) {
    // 빠르게 움직일 때는 마지막 점수를 유지합니다. 이력이 없으면 null로 기다립니다.
    next.protection = 'moving';
    next.currentScore = base.lastScore;
  } else if (base.lastScore !== null && current.score < 100) {
    // 멈춘 뒤 이탈이 연속되는지 확인합니다. 움직임·누락 후에는 유예를 새로 셉니다.
    const wasStaticDeviation = connected && base.protection !== 'moving' && base.rawScore !== null && base.rawScore < 100;
    next.staticDeviationMs = wasStaticDeviation ? base.staticDeviationMs + elapsedMs : 0;
    if (next.staticDeviationMs <= MOTION_PROTECTION.graceMs + roundingMs) {
      // 처음 2초: 잠깐 움직인 것일 수 있으므로 유지합니다.
      next.protection = 'grace';
      next.currentScore = held;
    } else {
      // 2초를 넘긴 시간만 감점합니다. 원점수보다 더 낮게 깎지는 않습니다.
      // 예: 마지막 100점, 원점수 60점, 감점 구간 0.1초 → 100 - 35 × 0.1 = 96.5점.
      const penaltyMs = Math.min(elapsedMs, next.staticDeviationMs - MOTION_PROTECTION.graceMs);
      next.currentScore = Math.max(current.score, held - MOTION_PROTECTION.penaltyPointsPerSecond * penaltyMs / 1000);
    }
  } else if (current.score === 100 && held < 100) {
    // 원점수가 잠깐 100이 됐다고 바로 회복하지 않습니다. 정면 허용 범위를 1초 확인합니다.
    const wasNearReference = connected && base.protection !== 'moving' && base.rawScore === 100;
    next.nearReferenceMs = wasNearReference ? base.nearReferenceMs + elapsedMs : 0;
    if (next.nearReferenceMs + roundingMs < MOTION_PROTECTION.recoveryMs) {
      next.protection = 'recovering';
      next.currentScore = held;
    }
  }
  // 처음부터 움직여 유지할 점수도 없거나, 연속 구간이 없으면 평균에는 아직 넣지 않습니다.
  if (next.currentScore === null) return next;
  next.lastScore = next.currentScore;
  if (!connected) return next;

  // 평균 = "구간 양 끝 점수의 평균 × 구간 시간"의 합 / 전체 유효 시간.
  // 원점수가 아니라 보호를 적용한 표시 점수를 사용합니다. 유효한 움직임/유예 구간도 포함합니다.
  const intervalMs = Math.min(elapsedMs, DEFAULT_CALIBRATION_OPTIONS.maxGapMs);
  next.validMs += intervalMs;
  next.continuousMs = base.continuousMs + intervalMs;
  next.longestContinuousMs = Math.max(base.longestContinuousMs, next.continuousMs);
  next.scoreTimeSum += (base.currentScore! + next.currentScore!) / 2 * intervalMs;
  next.averageScore = next.scoreTimeSum / next.validMs;

  // 아래부터는 점수와 별도의 습관 집계입니다. 움직임을 가로지르는 이탈 구간은 세지 않습니다.
  if (moving || base.protection === 'moving') return next;
  if (base.deviationState === 'away' && current.deviation! > HABIT_POLICY.exitDelta) {
    // 이미 확정한 이탈이 계속되면 확인한 구간 시간만 더합니다.
    next.deviationState = 'away';
    next.deviationMs += intervalMs;
  } else if (current.deviation! >= HABIT_POLICY.enterDelta) {
    // 이탈 진입 후보가 2초 이어지면 1회로 확정합니다. 대기 2초는 이탈 시간에 소급하지 않습니다.
    next.pendingMs = base.currentDeviation! >= HABIT_POLICY.enterDelta ? base.pendingMs + intervalMs : 0;
    next.deviationState = 'pending';
    if (next.pendingMs + roundingMs >= HABIT_POLICY.minDurationMs) {
      next.deviationState = 'away';
      next.deviationEpisodeCount += 1;
      next.pendingMs = 0;
    }
  } else {
    // 확정된 이탈에서 빠져나왔거나 새 이탈 진입 기준 아래입니다. 건강 정상 판정은 아닙니다.
    next.deviationState = 'near-reference';
  }
  return next;
}
