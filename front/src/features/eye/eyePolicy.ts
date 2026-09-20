/** Prototype policy, not clinical thresholds. Change the version when tuning. */
export const eyePolicy = {
  version: 'eye-habits-v2',
  maxGapMs: 250,
  calibrationMs: 3000,
  calibrationSamples: 30,
  closeThreshold: 0.55,
  openThreshold: 0.25,
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
