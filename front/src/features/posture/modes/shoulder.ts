import type { ScorePolicy } from '../scoring.ts';

/** Initial product parameters for projected reference similarity, not medical thresholds. */
export const shoulderScorePolicy: ScorePolicy = Object.freeze({
  version: 'reference-similarity-shoulder-v1',
  mode: 'shoulder',
  metrics: Object.freeze(['shoulderHeightDifferenceShoulderWidths'] as const),
  fullCreditDelta: 0.05,
  zeroCreditDelta: 0.30,
});
