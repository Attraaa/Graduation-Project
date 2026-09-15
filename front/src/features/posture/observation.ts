import { DEFAULT_CALIBRATION_OPTIONS, extractFrontalMeasurement } from './calibration.ts';
import type { CalibrationFrame, CalibrationReason, CalibrationReference, FrontalMetrics } from './calibration.ts';

export interface ObservationState {
  observedSeconds: number;
  lastTimestampMs: number | null;
  lastValidAtMs: number | null;
  reference: CalibrationReference | null;
  delta: FrontalMetrics | null;
  reason: CalibrationReason | null;
}

export function createObservation(): ObservationState {
  return { observedSeconds: 0, lastTimestampMs: null, lastValidAtMs: null, reference: null, delta: null, reason: null };
}

/** Missing observations are unknown, never evidence of rest or a matching posture. */
export function interruptObservation(previous: ObservationState): ObservationState {
  return { ...previous, lastValidAtMs: null, delta: null, reason: 'interrupted' };
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
  const baseline = reference.metrics;
  return {
    ...next,
    observedSeconds: previous.observedSeconds + addedSeconds,
    lastValidAtMs: timestampMs,
    reason: null,
    delta: {
      noseOffsetShoulderWidths: current.measurement.noseOffsetShoulderWidths - baseline.noseOffsetShoulderWidths,
      noseHeightShoulderWidths: current.measurement.noseHeightShoulderWidths - baseline.noseHeightShoulderWidths,
      shoulderHeightDifferenceShoulderWidths: current.measurement.shoulderHeightDifferenceShoulderWidths - baseline.shoulderHeightDifferenceShoulderWidths,
    },
  };
}
