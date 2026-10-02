import type { PostureDeltas } from './observation.ts';
import { YAW_LIMIT } from './scoreSettings.ts';

export type PostureMode = 'turtle' | 'shoulder';
export type ScoreMetric = Exclude<keyof PostureDeltas, 'yawRatio'>;

export interface ScorePolicy {
  readonly version: string;
  readonly mode: PostureMode;
  readonly weights: Readonly<Partial<Record<ScoreMetric, number>>>;
  readonly fullCreditDelta: number;
  readonly zeroCreditDelta: number;
}

export interface PostureScore {
  scorePolicyVersion: string;
  score: number | null;
  deviation: number | null;
}

/** Score similarity to the session reference, never anatomical health or correct use. */
export function scorePosture(delta: PostureDeltas | null, policy: ScorePolicy): PostureScore {
  const unknown = { scorePolicyVersion: policy.version, score: null, deviation: null };
  if (delta === null) return unknown;
  if (policy.mode === 'turtle' && !Number.isFinite(delta.yawRatio)) return unknown;

  let deviation = 0;
  for (const [metric, weight] of Object.entries(policy.weights) as [ScoreMetric, number][]) {
    if (!Number.isFinite(weight) || weight < 0) return unknown;
    if (weight === 0 || (metric === 'headForward' && delta.yawRatio > YAW_LIMIT)) continue;
    if (!Number.isFinite(delta[metric]) || delta[metric] < 0) return unknown;
    deviation += weight * delta[metric];
  }

  const score = deviation <= policy.fullCreditDelta ? 100
    : deviation >= policy.zeroCreditDelta ? 0
      : 100 * (policy.zeroCreditDelta - deviation) / (policy.zeroCreditDelta - policy.fullCreditDelta);
  // Keep precision until display or a completed time-weighted average.
  return { scorePolicyVersion: policy.version, score, deviation };
}
