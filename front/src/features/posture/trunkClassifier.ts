import type { PoseLandmark } from './calibration.ts';
import { trunkModel } from './trunkModel.ts';

export type TrunkClass = 'upright' | 'forward' | 'backward' | 'lateral';
export type TrunkReason = 'missing-landmarks' | 'out-of-domain' | 'uncertain' | 'confirming' | 'interrupted';
export interface TrunkEstimate {
  label: TrunkClass | null;
  reason: TrunkReason | null;
}
export const emptyTrunkEstimate = (): TrunkEstimate => ({ label: null, reason: 'interrupted' });

// Same seven dimensionless features as train_multiposture.py. World coordinates must
// come from poseWorldLandmarks, never normalized image x/y/z or a shoulder=C7 substitution.
export function trunkFeatures(world: readonly PoseLandmark[] | undefined): number[] | null {
  const ids = [0, 11, 12, 23, 24];
  if (!world || ids.some(id => !world[id] || ![world[id].x, world[id].y, world[id].z].every(Number.isFinite))) return null;
  const point = (id: number) => [world[id].x, world[id].y, world[id].z!];
  const left = point(11), right = point(12), nose = point(0), leftHip = point(23), rightHip = point(24);
  const span = Math.hypot(...left.map((value, i) => value - right[i]));
  if (span < 1e-6) return null;
  const shoulder = left.map((value, i) => (value + right[i]) / 2);
  const torso = shoulder.map((value, i) => (value - (leftHip[i] + rightHip[i]) / 2) / span);
  const head = nose.map((value, i) => (value - shoulder[i]) / span);
  return [Math.abs(torso[0]), torso[1], torso[2], Math.abs(head[0]), head[1], head[2], Math.abs(left[1] - right[1]) / span];
}

/** Pure 7-16-4 tanh network. These softmax values are NOT calibrated accuracy percentages. */
export function trunkProbabilities(features: readonly number[]): number[] | null {
  if (features.length !== trunkModel.mean.length || !features.every(Number.isFinite)) return null;
  const normalized = features.map((value, i) => (value - trunkModel.mean[i]) / trunkModel.scale[i]);
  const hidden = trunkModel.b1.map((bias, j) => Math.tanh(bias + normalized.reduce((sum, value, i) => sum + value * trunkModel.w1[i][j], 0)));
  const logits = trunkModel.b2.map((bias, j) => bias + hidden.reduce((sum, value, i) => sum + value * trunkModel.w2[i][j], 0));
  const exp = logits.map(value => Math.exp(value - Math.max(...logits)));
  const total = exp.reduce((a, b) => a + b, 0);
  return exp.map(value => value / total);
}

export function classifyTrunk(image: readonly PoseLandmark[] | undefined, world: readonly PoseLandmark[] | undefined): TrunkEstimate {
  // Laptop crops often hide hips: inferred off-screen hips must not become observed torso posture.
  if (!image || [0, 11, 12, 23, 24].some(id => {
    const point = image[id];
    return !point || ![point.x, point.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)
      || !Number.isFinite(point.visibility) || point.visibility! < 0.8 || point.visibility! > 1;
  })) return { label: null, reason: 'missing-landmarks' };
  const features = trunkFeatures(world);
  if (!features) return { label: null, reason: 'missing-landmarks' };
  if (features.some((value, i) => {
    const padding = trunkModel.domainPadding * (trunkModel.upper[i] - trunkModel.lower[i]);
    return value < trunkModel.lower[i] - padding || value > trunkModel.upper[i] + padding;
  })) return { label: null, reason: 'out-of-domain' };
  const probabilities = trunkProbabilities(features)!;
  const ordered = probabilities.toSorted((a, b) => b - a);
  if (ordered[0] < trunkModel.minConfidence || ordered[0] - ordered[1] < trunkModel.minMargin) return { label: null, reason: 'uncertain' };
  return { label: trunkModel.classes[probabilities.indexOf(ordered[0])] as TrunkClass, reason: null };
}

export interface TrunkTracker {
  candidate: TrunkClass | null;
  since: number | null;
  lastAt: number | null;
  estimate: TrunkEstimate;
}
export function createTrunkTracker(): TrunkTracker {
  return { candidate: null, since: null, lastAt: null, estimate: emptyTrunkEstimate() };
}

/** One second of consecutive agreement; pause, gaps and low quality clear the displayed result. */
export function advanceTrunkTracker(previous: TrunkTracker, current: TrunkEstimate, at: number): TrunkTracker {
  if (!Number.isFinite(at) || at < 0 || (previous.lastAt !== null && at <= previous.lastAt)) {
    return { ...createTrunkTracker(), lastAt: previous.lastAt };
  }
  if (!current.label) return { ...createTrunkTracker(), lastAt: at, estimate: current };
  const connected = previous.lastAt !== null && at - previous.lastAt <= 500 && previous.candidate === current.label;
  const since = connected ? previous.since ?? at : at;
  return { candidate: current.label, since, lastAt: at,
    estimate: at - since >= 1000 ? current : { label: null, reason: 'confirming' } };
}
