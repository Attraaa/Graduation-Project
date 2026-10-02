import type { ScorePolicy } from '../scoring.ts';
import { SHOULDER_WEIGHTS, SHOULDER_LIMITS, scoreSettingsVersion } from '../scoreSettings.ts';

/** Initial product parameters for projected reference similarity, not medical thresholds. */
export const shoulderScorePolicy: ScorePolicy = Object.freeze({
  version: scoreSettingsVersion('shoulder', SHOULDER_WEIGHTS, SHOULDER_LIMITS),
  mode: 'shoulder',
  weights: SHOULDER_WEIGHTS,
  ...SHOULDER_LIMITS,
});
