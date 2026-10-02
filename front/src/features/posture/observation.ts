import { DEFAULT_CALIBRATION_OPTIONS, extractFrontalMeasurement } from './calibration.ts';
import type { CalibrationFrame, CalibrationReason, CalibrationReference, FrontalMeasurement } from './calibration.ts';

export interface PostureDeltas {
  headForward: number;
  torsoForward: number;
  neckSlump: number;
  shoulderTilt: number;
  shoulderShrug: number;
  yawRatio: number;
}

export interface ObservationState {
  observedSeconds: number;
  lastTimestampMs: number | null;
  lastValidAtMs: number | null;
  reference: CalibrationReference | null;
  delta: PostureDeltas | null;
  measurement: FrontalMeasurement | null;
  velocityPxPerSecond: number | null;
  reason: CalibrationReason | null;
}

export function createObservation(): ObservationState {
  return { observedSeconds: 0, lastTimestampMs: null, lastValidAtMs: null, reference: null, delta: null, measurement: null, velocityPxPerSecond: null, reason: null };
}

/** Missing observations are unknown, never evidence of rest or a matching posture. */
export function interruptObservation(previous: ObservationState): ObservationState {
  return { ...previous, lastValidAtMs: null, delta: null, measurement: null, velocityPxPerSecond: null, reason: 'interrupted' };
}

/** Compare projected geometry only; no anatomical diagnosis or score policy is applied. */
export function advanceObservation(
  previous: ObservationState,
  reference: CalibrationReference | null,
  frame: CalibrationFrame,
): ObservationState {
  const { timestampMs } = frame;
  const cleared = { ...interruptObservation(previous), reference };
  if (!Number.isFinite(timestampMs) || timestampMs < 0
    || (previous.lastTimestampMs !== null && timestampMs <= previous.lastTimestampMs)) {
    // Keep the high-water mark so replayed frames cannot count the same time twice.
    return { ...cleared, reason: 'invalid-time' };
  }
  const next = { ...cleared, lastTimestampMs: timestampMs };
  const current = extractFrontalMeasurement(frame);
  if (!current.valid) return { ...next, reason: current.reason };
  if (!reference) return { ...next, reason: null };
  if (reference.sourceId !== frame.sourceId || reference.widthPx !== frame.widthPx || reference.heightPx !== frame.heightPx) {
    return { ...next, reason: 'camera-changed' };
  }
  if (timestampMs < reference.completedAtMs) return { ...next, reason: 'invalid-time' };

  const sameReference = previous.reference?.completedAtMs === reference.completedAtMs
    && previous.reference.sourceId === reference.sourceId
    && previous.reference.widthPx === reference.widthPx && previous.reference.heightPx === reference.heightPx;
  const gapMs = previous.lastValidAtMs === null ? null : timestampMs - previous.lastValidAtMs;
  const addedSeconds = sameReference && gapMs !== null && gapMs <= DEFAULT_CALIBRATION_OPTIONS.maxGapMs
    ? gapMs / 1000 : 0;
  const measurement = current.measurement;
  const heightLoss = Math.max(0, (reference.baseEarHeightPx - measurement.earHeightPx) / reference.baseShoulderSpanPx);
  // Any fast ear/shoulder marks motion; never infer velocity across a missing interval.
  const velocityPxPerSecond = addedSeconds > 0 && previous.measurement
    ? Math.max(...measurement.motionPoints.map((point, index) => {
      const last = previous.measurement!.motionPoints[index];
      return Math.hypot(point.x - last.x, point.y - last.y) / addedSeconds;
    })) : null;
  return {
    ...next,
    observedSeconds: previous.observedSeconds + addedSeconds,
    lastValidAtMs: timestampMs,
    reason: null,
    measurement, velocityPxPerSecond,
    delta: {
      headForward: Math.max(0, (measurement.earSpanPx - reference.baseEarSpanPx) / reference.baseEarSpanPx),
      torsoForward: Math.max(0, (measurement.shoulderSpanPx - reference.baseShoulderSpanPx) / reference.baseShoulderSpanPx),
      neckSlump: heightLoss,
      shoulderTilt: Math.abs(measurement.shoulderHeightDifferenceShoulderWidths),
      shoulderShrug: heightLoss,
      yawRatio: measurement.yawRatio,
    },
  };
}
