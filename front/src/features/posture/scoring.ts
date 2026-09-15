import type { FrontalMetrics } from './calibration.ts';

export type PostureMode = 'turtle' | 'shoulder';

export interface ScorePolicy {
  readonly version: string;
  readonly mode: PostureMode;
  readonly metrics: readonly (keyof FrontalMetrics)[];
  readonly fullCreditDelta: number;
  readonly zeroCreditDelta: number;
}

export interface PostureScore {
  scorePolicyVersion: string;
  score: number | null;
  deviation: number | null;
}

/** Score similarity to the session reference, never anatomical health or correct use. */
export function scorePosture(delta: FrontalMetrics | null, policy: ScorePolicy): PostureScore {
  const unknown = { scorePolicyVersion: policy.version, score: null, deviation: null };
  if (delta === null) return unknown;

  let deviation = 0;
  for (const metric of policy.metrics) {
    if (!Number.isFinite(delta[metric])) return unknown;
    deviation = Math.max(deviation, Math.abs(delta[metric]));
  }

  const score = deviation <= policy.fullCreditDelta ? 100
    : deviation >= policy.zeroCreditDelta ? 0
      : 100 * (policy.zeroCreditDelta - deviation) / (policy.zeroCreditDelta - policy.fullCreditDelta);
  // Keep precision until display or a completed time-weighted average.
  return { scorePolicyVersion: policy.version, score, deviation };
}
