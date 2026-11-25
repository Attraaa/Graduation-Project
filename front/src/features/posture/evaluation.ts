import { ALERT_SCORE, ALERT_SECONDS } from '../notifications/activityPolicy.ts';
import { DEFAULT_CALIBRATION_OPTIONS } from './calibration.ts';

/**
 * [역할: 측정한 점수에 시간 규칙을 적용하고 세션 결과를 누적]
 * 목(E19)과 좌우 균형은 각자 One Euro 필터로 다듬은 점수(measured)를 매 관측마다 넘기고, 여기서 정수로 만들어
 * 표시·평균·기록에 씁니다(2026-11-25). 두 점수는 이 함수를 각각 호출하고, 각자 별도의 상태와 평균을 가집니다.
 * 실제 DB 쓰기는 이 파일 밖의 기록 모듈이 담당합니다. 2026-11-25에 어깨 점수와 그 보호 규칙(움직임 동결·유예·복귀 확인)은 없앴습니다.
 */
/** 이 파일 밖에서 계산한 점수(0–100)와 습관 편차. */
export interface MeasuredScore { score: number; deviation: number }

export type HabitPolicy = Readonly<{ version: string; enterDelta: number; exitDelta: number; minDurationMs: number }>;

/**
 * "기준에서 벗어남" 횟수/시간 규칙. 2026-11-25부터 설정 알림 카드의 상체 "N점 이하 N초 유지 시"를 그대로 씁니다(사용자 결정).
 * 화면에 보이는 정수 점수가 N점 이하로 N초 이어지면 1회 확정, 이후 N + 10점 이상이면 그 이탈 구간을 끝냅니다(경계에서 흔들릴 때
 * 횟수가 반복해 늘지 않게). 편차 = (100 − 점수) / 200이므로 진입 편차 (100 − N) / 200, 종료 편차 (100 − min(100, N + 10)) / 200입니다.
 * 상체를 시작할 때 읽어 그 실행 동안 고정하고, ID에 값이 들어가 기록마다 당시 기준이 남습니다(지난 기록은 그때 기준 그대로).
 * 예전 ID: `weighted-reference-deviation-v3`(70점 이하 2초, 80점 이상 종료)와 자세 무너짐 민감도 변형 `…:s<값>`(2026-10-17~11-25).
 */
export function habitRule(score: number, seconds: number): HabitPolicy {
  return Object.freeze({ version: `alert-hold-v1:${score}:${seconds}`, enterDelta: (100 - score) / 200,
    exitDelta: (100 - Math.min(100, score + 10)) / 200, minDurationMs: seconds * 1000 });
}
/** 알림 기본값(70점 이하 3초)의 규칙. */
export const HABIT_POLICY = habitRule(ALERT_SCORE.default, ALERT_SECONDS.default);

export interface EvaluationState {
  // 어떤 점수/습관 규칙으로 계산했는지 구분하는 ID입니다.
  scorePolicyVersion: string;
  habitPolicyVersion: string;
  // 화면에 표시할 정수 점수, 습관 편차, 세션 평균. null은 판정/평균 불가입니다.
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
  // 습관의 "이탈 1회"를 확정하기까지 쌓인 시간.
  pendingMs: number;
}

/** 새 세션의 빈 상태입니다. 아직 측정하지 않았으므로 처음부터 100점을 넣지 않습니다. */
export function createEvaluation(policy: { version: string }, habit: HabitPolicy = HABIT_POLICY): EvaluationState {
  return {
    scorePolicyVersion: policy.version,
    habitPolicyVersion: habit.version,
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
  };
}

/** 누락 시 현재 표시와 연속 타이머를 비웁니다. 평균·누적 통계는 보존합니다. */
export function interruptEvaluation(previous: EvaluationState): EvaluationState {
  return { ...previous, currentScore: null, currentDeviation: null, continuousMs: 0, deviationState: 'unknown', pendingMs: 0 };
}

/**
 * 잰 점수 하나를 처리합니다. observedSeconds는 그 점수의 관찰 시계(500ms 넘는 공백은 더하지 않음)입니다.
 * 표시·평균·기록은 반올림한 정수 점수를 쓰고(화면만이 아니라 저장도 정수, 사용자 결정 2026-11-25),
 * 평균 = "구간 양 끝 점수의 평균 × 구간 시간"의 합 / 전체 유효 시간입니다.
 */
export function advanceEvaluation(previous: EvaluationState, observation: { observedSeconds: number }, policy: { version: string },
  habit: HabitPolicy, measured: MeasuredScore): EvaluationState {
  // 규칙 버전이 달라졌으면 새 상태로 시작해 서로 다른 규칙의 평균을 섞지 않습니다.
  const base = previous.scorePolicyVersion === policy.version && previous.habitPolicyVersion === habit.version
    ? previous : createEvaluation(policy, habit);
  const next: EvaluationState = {
    ...interruptEvaluation(base),
    currentScore: Math.round(measured.score),
    currentDeviation: measured.deviation,
    lastObservedSeconds: observation.observedSeconds,
  };
  const elapsedMs = (observation.observedSeconds - base.lastObservedSeconds) * 1000;
  // 소수 시간 계산의 아주 작은 오차 때문에 정확히 500ms/2초인 경계를 넘지 않게 합니다.
  const roundingMs = Number.EPSILON * Math.max(1, observation.observedSeconds, base.lastObservedSeconds) * 4000;
  const connected = base.currentScore !== null && elapsedMs > 0 && elapsedMs <= DEFAULT_CALIBRATION_OPTIONS.maxGapMs + roundingMs;
  // 첫 점수·누락 뒤 첫 점수는 이을 구간이 없어 평균에 아직 넣지 않습니다.
  if (!connected) return next;

  const intervalMs = Math.min(elapsedMs, DEFAULT_CALIBRATION_OPTIONS.maxGapMs);
  next.validMs += intervalMs;
  next.continuousMs = base.continuousMs + intervalMs;
  next.longestContinuousMs = Math.max(base.longestContinuousMs, next.continuousMs);
  next.scoreTimeSum += (base.currentScore! + next.currentScore!) / 2 * intervalMs;
  next.averageScore = next.scoreTimeSum / next.validMs;

  // 아래부터는 점수와 별도의 습관 집계입니다.
  if (base.deviationState === 'away' && measured.deviation > habit.exitDelta) {
    // 이미 확정한 이탈이 계속되면 확인한 구간 시간만 더합니다.
    next.deviationState = 'away';
    next.deviationMs += intervalMs;
  } else if (measured.deviation >= habit.enterDelta) {
    // 이탈 진입 후보가 2초 이어지면 1회로 확정합니다. 대기 2초는 이탈 시간에 소급하지 않습니다.
    next.pendingMs = base.currentDeviation! >= habit.enterDelta ? base.pendingMs + intervalMs : 0;
    next.deviationState = 'pending';
    if (next.pendingMs + roundingMs >= habit.minDurationMs) {
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
