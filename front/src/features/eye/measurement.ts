import { eyePolicy as p } from './eyePolicy.ts';
import type { EyeSensitivity } from './eyePolicy.ts';
import type { EyeObservation } from './observation.ts';
import { createBlinkCalibration, createBlinkCycle, median } from './blinkCalibration.ts';
import type { BlinkThresholds } from './blinkCalibration.ts';

export type EyeSnapshot = {
  calibrated: boolean;
  calibrationPhase: 'distance' | 'eyes' | 'ready';
  calibrationBlinks: number;
  progress: number;
  blinks: number;
  validMs: number;
  blinksPerMinute: number | null;
  recentBlinksPerMinute: number | null;
  recentValidMs: number;
  faceScale: number | null;
  openReminder: boolean;
  nearReminder: boolean;
};
export const emptyEyeSnapshot = (): EyeSnapshot => ({
  calibrated: false, calibrationPhase: 'distance', calibrationBlinks: 0, progress: 0, blinks: 0, validMs: 0,
  blinksPerMinute: null, recentBlinksPerMinute: null, recentValidMs: 0,
  faceScale: null, openReminder: false, nearReminder: false,
});

/** Pure temporal state: calibration and unknown intervals never become measured blink time. */
export function createEyeMeasurement(sensitivity: EyeSensitivity = 'normal') {
  let snapshot = emptyEyeSnapshot();
  let lastAt: number | null = null, previousValid = false;
  let baseline: number | null = null;
  let references: EyeObservation[] = [], calibrationMs = 0;
  let eyeCalibration: ReturnType<typeof createBlinkCalibration> | null = null;
  let thresholds: BlinkThresholds | null = null;
  let cycle: ReturnType<typeof createBlinkCycle> | null = null;
  let previousOpen = false, openMs = 0, nearMs = 0, previousNear = false;
  let recentBlinks: number[] = [], referenceValidStart = 0;
  const resetContinuity = () => {
    cycle?.reset(); eyeCalibration?.resetTrial(); previousOpen = false; openMs = 0; nearMs = 0; previousNear = false;
  };
  const recalibrate = (): EyeSnapshot => {
    baseline = null; references = []; calibrationMs = 0;
    lastAt = null; previousValid = false;
    recentBlinks = []; referenceValidStart = snapshot.validMs;
    resetContinuity();
    snapshot = { ...snapshot, calibrated: false, calibrationPhase: 'distance', progress: 0, faceScale: null,
      recentBlinksPerMinute: null, recentValidMs: 0, openReminder: false, nearReminder: false };
    return { ...snapshot };
  };
  const recalibrateEyes = (): EyeSnapshot => {
    thresholds = null; cycle = null; eyeCalibration = null;
    snapshot.calibrationBlinks = 0;
    return recalibrate();
  };
  const sample = (now: number, observation: EyeObservation | null): EyeSnapshot => {
    if (!Number.isFinite(now) || (lastAt !== null && now <= lastAt)) return { ...snapshot };
    const delta = lastAt === null ? 0 : now - lastAt;
    const continuous = previousValid && delta > 0 && delta <= p.maxGapMs;
    lastAt = now;
    const valid = observation !== null && Number.isFinite(observation.faceWidth) && observation.faceWidth > 0
      && [observation.left, observation.right].every(n => Number.isFinite(n) && n >= 0 && n <= 1);
    previousValid = valid;
    if (!valid || !continuous) resetContinuity();
    if (!valid || !observation) {
      if (baseline === null) { references = []; calibrationMs = 0; }
      snapshot = { ...snapshot, progress: baseline === null ? 0 : thresholds ? 1 : snapshot.calibrationBlinks / p.calibrationBlinks,
        faceScale: null, openReminder: false, nearReminder: false };
      return { ...snapshot };
    }
    if (baseline === null) {
      if (!continuous) { references = []; calibrationMs = 0; }
      const candidate = [...references, observation];
      const widths = candidate.map(value => value.faceWidth), width = median(widths);
      const stable = (Math.max(...widths) - Math.min(...widths)) / width <= 0.1
        && (['left', 'right'] as const).every(side => observation[side] <= p.calibrationOpenMax
          && Math.max(...candidate.map(value => value[side])) - Math.min(...candidate.map(value => value[side])) <= p.calibrationOpenSpread);
      if (!stable) {
        references = observation.left <= p.calibrationOpenMax && observation.right <= p.calibrationOpenMax ? [observation] : [];
        calibrationMs = 0;
      } else {
        calibrationMs += continuous && references.length > 0 ? delta : 0; references = candidate;
      }
      snapshot.progress = Math.min(1, calibrationMs / p.calibrationMs, references.length / p.calibrationSamples);
      if (snapshot.progress >= 1) {
        baseline = width;
        if (thresholds) { cycle!.sample(now, observation); snapshot.calibrated = true; snapshot.calibrationPhase = 'ready'; }
        else {
          eyeCalibration = createBlinkCalibration({ left: median(references.map(value => value.left)), right: median(references.map(value => value.right)) }, sensitivity);
          eyeCalibration.sample(now, observation);
          snapshot.calibrationPhase = 'eyes'; snapshot.calibrationBlinks = 0; snapshot.progress = 0;
        }
        references = [];
      }
      return { ...snapshot };
    }
    if (!thresholds) {
      eyeCalibration!.sample(now, observation);
      snapshot.calibrationBlinks = eyeCalibration!.completed;
      snapshot.progress = snapshot.calibrationBlinks / p.calibrationBlinks;
      thresholds = eyeCalibration!.thresholds;
      if (thresholds) {
        cycle = createBlinkCycle(thresholds); cycle.sample(now, observation);
        snapshot.calibrated = true; snapshot.calibrationPhase = 'ready';
      }
      return { ...snapshot };
    }
    const dt = continuous ? delta : 0;
    snapshot.validMs += dt;
    if (cycle!.sample(now, observation)) { snapshot.blinks += 1; recentBlinks.push(snapshot.validMs); }
    const bothOpen = observation.left <= thresholds.left.open && observation.right <= thresholds.right.open;
    openMs = bothOpen ? previousOpen ? openMs + dt : 0 : 0;
    previousOpen = bothOpen;
    const faceScale = observation.faceWidth / baseline;
    if (faceScale >= p.nearRatio) nearMs += previousNear ? dt : 0;
    else if (faceScale <= p.nearReleaseRatio || !snapshot.nearReminder) nearMs = 0;
    previousNear = faceScale >= p.nearRatio;
    const recentValidMs = Math.min(p.rateWindowMs, snapshot.validMs - referenceValidStart);
    recentBlinks = recentBlinks.filter(at => at > snapshot.validMs - p.rateWindowMs);
    snapshot = { ...snapshot, faceScale,
      blinksPerMinute: snapshot.validMs >= p.rateMinValidMs ? snapshot.blinks * 60000 / snapshot.validMs : null,
      recentValidMs,
      recentBlinksPerMinute: recentValidMs >= p.rateMinValidMs ? recentBlinks.length * 60000 / recentValidMs : null,
      openReminder: openMs >= p.openReminderMs, nearReminder: nearMs >= p.nearHoldMs,
    };
    return { ...snapshot };
  };
  return { sample, recalibrate, recalibrateEyes };
}
