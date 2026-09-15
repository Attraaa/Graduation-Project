import { DEFAULT_CALIBRATION_OPTIONS } from './calibration.ts';
import type { ObservationState } from './observation.ts';
import { scorePosture } from './scoring.ts';
import type { ScorePolicy } from './scoring.ts';

/** Provisional reference-departure thresholds, not health, activity or rest criteria. */
export const HABIT_POLICY = Object.freeze({
  version: 'reference-deviation-v1',
  enterDelta: 0.15,
  exitDelta: 0.10,
  minDurationMs: 2000,
});

export interface EvaluationState {
  scorePolicyVersion: string;
  habitPolicyVersion: string;
  currentScore: number | null;
  currentDeviation: number | null;
  averageScore: number | null;
  validMs: number;
  continuousMs: number;
  longestContinuousMs: number;
  deviationEpisodeCount: number;
  deviationMs: number;
  deviationState: 'unknown' | 'near-reference' | 'pending' | 'away';
  lastObservedSeconds: number;
  scoreTimeSum: number;
  pendingMs: number;
}

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
  };
}

/** Preserve completed statistics while making the current observation unknown. */
export function interruptEvaluation(previous: EvaluationState): EvaluationState {
  return {
    ...previous,
    currentScore: null,
    currentDeviation: null,
    continuousMs: 0,
    deviationState: 'unknown',
    pendingMs: 0,
  };
}

/** Consume every observation once, immediately after the observation reducer. */
export function advanceEvaluation(
  previous: EvaluationState,
  observation: ObservationState,
  policy: ScorePolicy,
): EvaluationState {
  const base = previous.scorePolicyVersion === policy.version && previous.habitPolicyVersion === HABIT_POLICY.version
    ? previous : createEvaluation(policy);
  const current = scorePosture(observation.delta, policy);
  const next: EvaluationState = {
    ...interruptEvaluation(base),
    currentScore: current.score,
    currentDeviation: current.deviation,
    lastObservedSeconds: observation.observedSeconds,
  };
  const elapsedMs = (observation.observedSeconds - base.lastObservedSeconds) * 1000;
  // Subtraction of accumulated seconds can round an accepted 500ms interval upward.
  const roundingMs = Number.EPSILON * Math.max(1, observation.observedSeconds, base.lastObservedSeconds) * 2000;
  if (base.currentScore === null || current.score === null || elapsedMs <= 0
    || elapsedMs > DEFAULT_CALIBRATION_OPTIONS.maxGapMs + roundingMs) return next;

  const intervalMs = Math.min(elapsedMs, DEFAULT_CALIBRATION_OPTIONS.maxGapMs);
  next.validMs += intervalMs;
  next.continuousMs = base.continuousMs + intervalMs;
  next.longestContinuousMs = Math.max(base.longestContinuousMs, next.continuousMs);
  next.scoreTimeSum += (base.currentScore + current.score) / 2 * intervalMs;
  next.averageScore = next.scoreTimeSum / next.validMs;

  if (base.deviationState === 'away' && current.deviation! > HABIT_POLICY.exitDelta) {
    next.deviationState = 'away';
    next.deviationMs += intervalMs;
  } else if (current.deviation! >= HABIT_POLICY.enterDelta) {
    next.pendingMs = base.currentDeviation! >= HABIT_POLICY.enterDelta ? base.pendingMs + intervalMs : 0;
    next.deviationState = 'pending';
    if (next.pendingMs + roundingMs >= HABIT_POLICY.minDurationMs) {
      next.deviationState = 'away';
      next.deviationEpisodeCount += 1;
      next.pendingMs = 0;
    }
  } else {
    next.deviationState = 'near-reference';
  }
  return next;
}
