import type { CalibrationReason } from './calibration.ts';
import type { PostureDeltas } from './observation.ts';
import type { ObservationState } from './observation.ts';
import { createEvaluation } from './evaluation.ts';
import type { EvaluationState } from './evaluation.ts';
import { turtleScorePolicy } from './modes/turtle.ts';
import { shoulderScorePolicy } from './modes/shoulder.ts';

export type EvaluationSummary = Pick<EvaluationState, 'scorePolicyVersion' | 'habitPolicyVersion'
  | 'currentScore' | 'currentDeviation' | 'averageScore' | 'validMs' | 'continuousMs'
  | 'longestContinuousMs' | 'deviationEpisodeCount' | 'deviationMs' | 'deviationState' | 'protection'
  | 'rawScore' | 'staticDeviationMs' | 'nearReferenceMs' | 'pendingMs'>;

/** Camera-independent view contract. Null is unavailable; a measured zero is still a score. */
export interface MonitorSnapshot {
  phase: 'loading' | 'calibrating' | 'observing' | 'unavailable' | 'error';
  message?: string;
  evidence?: { head: ObservationState['headEvidence']; trunk: ObservationState['trunk']['estimate']; modelEligible: boolean };
  progress: number;
  reason: CalibrationReason | null;
  observedSeconds: number;
  delta: PostureDeltas | null;
  neck: EvaluationSummary;
  shoulder: EvaluationSummary;
}

export function createMonitorSnapshot(): MonitorSnapshot {
  return {
    phase: 'loading', progress: 0, reason: null, observedSeconds: 0, delta: null,
    neck: createEvaluation(turtleScorePolicy),
    shoulder: createEvaluation(shoulderScorePolicy),
  };
}
