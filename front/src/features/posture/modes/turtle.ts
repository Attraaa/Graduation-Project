import type { ScorePolicy } from '../scoring.ts';
import { NECK_WEIGHTS, NECK_LIMITS, scoreSettingsVersion } from '../scoreSettings.ts';

/** Initial product parameters for projected reference similarity, not medical thresholds. */
export const turtleScorePolicy: ScorePolicy = Object.freeze({
  version: scoreSettingsVersion('neck', NECK_WEIGHTS, NECK_LIMITS),
  mode: 'turtle',
  weights: NECK_WEIGHTS,
  ...NECK_LIMITS,
});
