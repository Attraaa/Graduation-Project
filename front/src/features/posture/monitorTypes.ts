import type { CalibrationReason } from './calibration.ts';
import type { PostureDeltas } from './observation.ts';
import { createEvaluation } from './evaluation.ts';
import type { EvaluationState } from './evaluation.ts';
import { turtleScorePolicy } from './modes/turtle.ts';
import { balanceScorePolicy } from './modes/balance.ts';
import type { NeckFailure } from './e19/model.ts';
import type { NeckStep } from './e19/flow.ts';

export type EvaluationSummary = Pick<EvaluationState, 'scorePolicyVersion' | 'habitPolicyVersion'
  | 'currentScore' | 'currentDeviation' | 'averageScore' | 'validMs' | 'continuousMs'
  | 'longestContinuousMs' | 'deviationEpisodeCount' | 'deviationMs' | 'deviationState'>;

/** 측정 시작 때의 기준 자세 보정(3초 준비 → 5초 기록 → 실패면 이유 안내 후 다시). */
export interface NeckModelView {
  step: NeckStep;
  /** 준비·기록·실패 안내의 남은 초. */
  secondsLeft: number | null;
  failure: NeckFailure | null;
}

/** Camera-independent view contract. Null is unavailable; a measured zero is still a score. */
export interface MonitorSnapshot {
  phase: 'loading' | 'calibrating' | 'observing' | 'unavailable' | 'error';
  progress: number;
  reason: CalibrationReason | null;
  observedSeconds: number;
  delta: PostureDeltas | null;
  neck: EvaluationSummary;
  /** 좌우 균형(2026-11-25, 어깨 점수를 대신함): 고개와 보이면 어깨선이 기준보다 기운 정도. */
  balance: EvaluationSummary;
  runAverages: { neck: number | null; balance: number | null };
  neckModel: NeckModelView;
}

export function createMonitorSnapshot(): MonitorSnapshot {
  return {
    phase: 'loading', progress: 0, reason: null, observedSeconds: 0, delta: null,
    neck: createEvaluation(turtleScorePolicy),
    balance: createEvaluation(balanceScorePolicy),
    runAverages: { neck: null, balance: null },
    neckModel: { step: 'prep', secondsLeft: null, failure: null },
  };
}
