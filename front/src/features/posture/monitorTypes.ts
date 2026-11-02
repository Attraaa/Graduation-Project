import type { CalibrationReason } from './calibration.ts';
import type { PostureDeltas } from './observation.ts';
import type { ObservationState } from './observation.ts';
import { createEvaluation } from './evaluation.ts';
import type { EvaluationState } from './evaluation.ts';
import { turtleScorePolicy } from './modes/turtle.ts';
import { shoulderScorePolicy } from './modes/shoulder.ts';
import type { ViewResult } from './viewReferences.ts';

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
  /** Side monitor whose reference produced the current values; null for the front (camera-facing) reference. */
  view: { id: string; label: string } | null;
  /** Side-monitor reference being collected; `waiting` until the blink calibration finishes. */
  viewCalibration: { id: string; label: string; index: number; total: number; progress: number; reason: CalibrationReason | null; waiting: boolean } | null;
  /** Side-monitor references of this session, in collection order. */
  views: readonly ViewResult[];
}

export function createMonitorSnapshot(): MonitorSnapshot {
  return {
    phase: 'loading', progress: 0, reason: null, observedSeconds: 0, delta: null, view: null, viewCalibration: null, views: [],
    neck: createEvaluation(turtleScorePolicy),
    shoulder: createEvaluation(shoulderScorePolicy),
  };
}
