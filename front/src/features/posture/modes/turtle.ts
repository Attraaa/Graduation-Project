import type { ScorePolicy } from '../scoring.ts';

/** Initial product parameters for projected reference similarity, not medical thresholds. */
export const turtleScorePolicy: ScorePolicy = Object.freeze({
  version: 'reference-similarity-turtle-v1',
  mode: 'turtle',
  metrics: Object.freeze(['noseOffsetShoulderWidths', 'noseHeightShoulderWidths'] as const),
  fullCreditDelta: 0.05,
  zeroCreditDelta: 0.30,
});
