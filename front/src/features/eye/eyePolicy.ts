/** Prototype policy, not clinical thresholds. Change the version when tuning. */
export type EyeSensitivity = 'low' | 'normal' | 'high';
export const eyePolicyVersion = (sensitivity: EyeSensitivity = 'normal') => `eye-habits-v3:${sensitivity}`;
export const isCurrentEyePolicy = (version: string) => ['low', 'normal', 'high'].some(value => version === `eye-habits-v3:${value}`);
export const eyePolicy = {
  version: eyePolicyVersion(),
  maxGapMs: 250,
  calibrationMs: 3000,
  calibrationSamples: 30,
  calibrationOpenMax: 0.35,
  calibrationOpenSpread: 0.12,
  calibrationBlinks: 3,
  minEyeSeparation: 0.16,
  calibrationReopenMargin: 0.08,
  calibrationStrongSeparation: 0.20,
  minSingleFrameBlinkMs: 25,
  minBlinkMs: 40,
  maxBlinkMs: 700,
  rateMinValidMs: 30000,
  rateWindowMs: 60000,
  openReminderMs: 15000,
  nearRatio: 1.25,
  nearReleaseRatio: 1.15,
  nearHoldMs: 3000,
  breakIntervalMs: 20 * 60 * 1000,
  breakDurationMs: 20000,
} as const;
