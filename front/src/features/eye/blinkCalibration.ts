import { eyePolicy as p } from './eyePolicy.ts';
import type { EyeSensitivity } from './eyePolicy.ts';

type Eyes = { left: number; right: number };
type Limits = { open: number; closed: number; strong: number };
export type BlinkThresholds = { left: Limits; right: Limits };
export const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const fractions = {
  low: { closed: 0.70, open: 0.20 },
  normal: { closed: 0.55, open: 0.25 },
  high: { closed: 0.40, open: 0.30 },
} as const;

/** Bilateral cycles only. A single captured closed frame needs a stronger signal. */
export function createBlinkCycle(thresholds: BlinkThresholds) {
  let phase: 'unarmed' | 'open' | 'closed' = 'unarmed';
  let closedAt = 0, closedFrames = 0, strong = false;
  let peak: Eyes = { left: 0, right: 0 };
  const reset = () => { phase = 'unarmed'; closedFrames = 0; strong = false; };
  const sample = (now: number, eyes: Eyes): Eyes | null => {
    const bothOpen = eyes.left <= thresholds.left.open && eyes.right <= thresholds.right.open;
    const bothClosed = eyes.left >= thresholds.left.closed && eyes.right >= thresholds.right.closed;
    if (bothOpen) {
      const duration = now - closedAt;
      const completed = phase === 'closed' && duration <= p.maxBlinkMs
        && (closedFrames >= 2 ? duration >= p.minBlinkMs : strong && duration >= p.minSingleFrameBlinkMs);
      phase = 'open'; closedFrames = 0; strong = false;
      return completed ? { ...peak } : null;
    }
    if (phase === 'closed' && now - closedAt > p.maxBlinkMs) reset();
    if (bothClosed && phase === 'open') {
      phase = 'closed'; closedAt = now; closedFrames = 0; peak = { ...eyes };
    }
    if (phase === 'closed') {
      if (bothClosed) {
        closedFrames += 1;
        strong ||= eyes.left >= thresholds.left.strong && eyes.right >= thresholds.right.strong;
      }
      peak = { left: Math.max(peak.left, eyes.left), right: Math.max(peak.right, eyes.right) };
    }
    return null;
  };
  return { sample, reset };
}

/** Three deliberate cycles learn each eye independently; no averaging a wink into a blink. */
export function createBlinkCalibration(open: Eyes, sensitivity: EyeSensitivity) {
  const trial = createBlinkCycle({
    left: { open: open.left + p.calibrationReopenMargin, closed: open.left + p.minEyeSeparation, strong: open.left + p.calibrationStrongSeparation },
    right: { open: open.right + p.calibrationReopenMargin, closed: open.right + p.minEyeSeparation, strong: open.right + p.calibrationStrongSeparation },
  });
  const peaks: Eyes[] = [];
  let thresholds: BlinkThresholds | null = null;
  const sample = (now: number, eyes: Eyes) => {
    if (thresholds) return;
    const peak = trial.sample(now, eyes);
    if (!peak || peak.left - open.left < p.minEyeSeparation || peak.right - open.right < p.minEyeSeparation) return;
    peaks.push(peak);
    if (peaks.length < p.calibrationBlinks) return;
    const fractionsForPreset = fractions[sensitivity];
    const limits = (side: 'left' | 'right'): Limits => {
      const gap = median(peaks.map(value => value[side])) - open[side];
      return { open: open[side] + gap * fractionsForPreset.open,
        closed: open[side] + gap * fractionsForPreset.closed, strong: open[side] + gap * 0.85 };
    };
    thresholds = { left: limits('left'), right: limits('right') };
  };
  return { sample, resetTrial: trial.reset, get completed() { return peaks.length; }, get thresholds() { return thresholds; } };
}
