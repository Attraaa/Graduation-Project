import type { CalibrationReason, FrontalMetrics } from './calibration.ts';
import { createEvaluation } from './evaluation.ts';
import type { EvaluationState } from './evaluation.ts';
import type { ScorePolicy } from './scoring.ts';

export type EvaluationSummary = Pick<EvaluationState, 'scorePolicyVersion' | 'habitPolicyVersion'
  | 'currentScore' | 'currentDeviation' | 'averageScore' | 'validMs' | 'continuousMs'
  | 'longestContinuousMs' | 'deviationEpisodeCount' | 'deviationMs' | 'deviationState'>;

/** Camera-independent view contract. Null is unavailable; a measured zero is still a score. */
export interface MonitorSnapshot {
  phase: 'loading' | 'calibrating' | 'observing' | 'unavailable' | 'error';
  progress: number;
  reason: CalibrationReason | null;
  observedSeconds: number;
  delta: FrontalMetrics | null;
  evaluation: EvaluationSummary;
}

export function createMonitorSnapshot(policy: ScorePolicy): MonitorSnapshot {
  return {
    phase: 'loading', progress: 0, reason: null, observedSeconds: 0, delta: null,
    evaluation: createEvaluation(policy),
  };
}
