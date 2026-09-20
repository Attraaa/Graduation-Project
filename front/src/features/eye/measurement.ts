import { eyePolicy as p } from './eyePolicy.ts';
import type { EyeObservation } from './observation.ts';

export type EyeSnapshot = {
  calibrated: boolean;
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
  calibrated: false, progress: 0, blinks: 0, validMs: 0,
  blinksPerMinute: null, recentBlinksPerMinute: null, recentValidMs: 0,
  faceScale: null, openReminder: false, nearReminder: false,
});

/** Pure temporal state: gaps never count as observed time or a completed blink. */
export function createEyeMeasurement() {
  let snapshot = emptyEyeSnapshot();
  let lastAt: number | null = null;
  let previousValid = false;
  let baseline: number | null = null;
  let widths: number[] = [];
  let calibrationMs = 0;
  let phase: 'unarmed' | 'open' | 'closed' = 'unarmed';
  let closedAt = 0;
  let openMs = 0;
  let nearMs = 0;
  let previousNear = false;
  let recentBlinks: number[] = [];
  let referenceValidStart = 0;
  const resetContinuity = () => { phase = 'unarmed'; openMs = 0; nearMs = 0; previousNear = false; };
  // A changed camera/reference starts a new recent window without erasing session totals.
  const recalibrate = (): EyeSnapshot => {
    baseline = null; widths = []; calibrationMs = 0;
    lastAt = null; previousValid = false;
    recentBlinks = []; referenceValidStart = snapshot.validMs;
    resetContinuity();
    snapshot = { ...snapshot, calibrated: false, progress: 0, faceScale: null,
      recentBlinksPerMinute: null, recentValidMs: 0, openReminder: false, nearReminder: false };
    return { ...snapshot };
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
      if (baseline === null) { widths = []; calibrationMs = 0; }
      snapshot = { ...snapshot, progress: baseline === null ? 0 : 1, faceScale: null, openReminder: false, nearReminder: false };
      return { ...snapshot };
    }
    if (baseline === null) {
      if (!continuous) { widths = []; calibrationMs = 0; }
      const candidate = [...widths, observation.faceWidth];
      const sorted = [...candidate].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      if ((sorted.at(-1)! - sorted[0]) / median > 0.1) {
        widths = [observation.faceWidth]; calibrationMs = 0;
      } else {
        widths = candidate; calibrationMs += continuous ? delta : 0;
      }
      snapshot.progress = Math.min(1, calibrationMs / p.calibrationMs, widths.length / p.calibrationSamples);
      if (snapshot.progress >= 1) { baseline = median; snapshot.calibrated = true; }
      return { ...snapshot };
    }
    const dt = continuous ? delta : 0;
    snapshot.validMs += dt;
    const bothOpen = observation.left <= p.openThreshold && observation.right <= p.openThreshold;
    const bothClosed = observation.left >= p.closeThreshold && observation.right >= p.closeThreshold;
    if (bothOpen) {
      if (phase === 'closed') {
        const duration = now - closedAt;
        if (duration >= p.minBlinkMs && duration <= p.maxBlinkMs) {
          snapshot.blinks += 1;
          recentBlinks.push(snapshot.validMs);
        }
      }
      openMs = phase === 'open' ? openMs + dt : 0;
      phase = 'open';
    } else {
      openMs = 0;
      if (bothClosed && phase === 'open') { phase = 'closed'; closedAt = now; }
      if (phase === 'closed' && now - closedAt > p.maxBlinkMs) phase = 'unarmed';
    }
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
      openReminder: openMs >= p.openReminderMs,
      nearReminder: nearMs >= p.nearHoldMs,
    };
    return { ...snapshot };
  };
  return { sample, recalibrate };
}
