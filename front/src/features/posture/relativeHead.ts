import type { PoseLandmark } from './calibration.ts';
import { RELATIVE_HEAD } from './scoreSettings.ts';

/** Nose and ear-midpoint depths relative to shoulders. Estimated geometry, never cm. */
export function headDepth(world?: readonly PoseLandmark[]): readonly [number, number] | null {
  if (!world || [0, 7, 8, 11, 12].some(i => !world[i] || ![world[i].x, world[i].y, world[i].z].every(Number.isFinite))) return null;
  const left = world[11], right = world[12];
  const span = Math.hypot(left.x - right.x, left.y - right.y, left.z! - right.z!);
  if (span < 1e-6) return null;
  const shoulderZ = (left.z! + right.z!) / 2;
  const result = [(world[0].z! - shoulderZ) / span, ((world[7].z! + world[8].z!) / 2 - shoulderZ) / span] as const;
  return result.every(value => Math.abs(value) <= 2) ? result : null;
}

export function relativeHeadEvidence(earScale: number, shoulderScale: number,
  baseline: readonly [number, number] | null | undefined, current: readonly [number, number] | null) {
  const framingChange = Math.abs(shoulderScale - 1);
  // Real approach changes perspective; unlike a uniform image resize, face/shoulder
  // width need not grow equally. Permit a bounded residual only when framing changes.
  const tolerance = Math.min(RELATIVE_HEAD.maxScaleTolerance, framingChange * RELATIVE_HEAD.scaleToleranceGain);
  const width = Math.max(0, earScale / shoulderScale - 1 - tolerance);
  // Two depth cues must agree. Fade inferred depth out as shoulders grow/shrink so
  // model drift during shared approach cannot become an independent head penalty.
  const depthWeight = Math.max(0, 1 - framingChange / RELATIVE_HEAD.depthScaleFade);
  const depth = baseline && current
    ? Math.max(0, Math.min(baseline[0] - current[0], baseline[1] - current[1]) - RELATIVE_HEAD.depthNoise) * depthWeight : 0;
  return { width, depth, tolerance, shoulderScale,
    headForward: Math.max(width, depth) * RELATIVE_HEAD.headGain,
    source: depth > width ? 'depth' as const : 'width' as const };
}

/** A trunk label alone never reduces a score; at most 12.5 additional raw neck points. */
export function trunkContribution(baselineUpright: boolean, confirmedForward: boolean, head: number, slump: number): number {
  return baselineUpright && confirmedForward
    ? RELATIVE_HEAD.modelMaxDelta * Math.min(1, Math.max(head, slump) / RELATIVE_HEAD.modelEvidenceDelta) : 0;
}
