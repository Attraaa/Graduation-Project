export interface PoseLandmark {
  x: number;
  y: number;
  visibility?: number;
}

export interface CalibrationFrame {
  landmarks?: readonly PoseLandmark[];
  widthPx: number;
  heightPx: number;
  /** Use the active video track ID; a replacement stream needs a new identity. */
  sourceId: string;
  /** Monotonic capture time, e.g. performance.now(); not a wall-clock date. */
  timestampMs: number;
}

export interface FrontalMetrics {
  /** Signed image-right displacement of the nose, divided by shoulder span. */
  noseOffsetShoulderWidths: number;
  /** Image-up nose height above the shoulder midpoint, divided by shoulder span. */
  noseHeightShoulderWidths: number;
  /** (Anatomical left shoulder y - right shoulder y) / shoulder span; y points down. */
  shoulderHeightDifferenceShoulderWidths: number;
}

export interface FrontalMeasurement extends FrontalMetrics {
  sourceId: string;
  widthPx: number;
  heightPx: number;
  timestampMs: number;
  /** Shoulder midpoint in normalized image coordinates [0, 1]. */
  shoulderCenterX: number;
  shoulderCenterY: number;
  shoulderWidthFrameWidths: number;
}

export type CalibrationReason = 'invalid-frame' | 'missing-landmarks' | 'low-confidence'
  | 'out-of-frame' | 'shoulders-too-close' | 'moving' | 'interrupted' | 'camera-changed'
  | 'invalid-time';

export interface CalibrationOptions {
  durationMs: number;
  minSamples: number;
  sampleIntervalMs: number;
  maxGapMs: number;
  minVisibility: number;
  minShoulderWidthFrameWidths: number;
  maxMetricRangeShoulderWidths: number;
  maxCenterRangeNormalized: number;
  maxWidthRangeFrameWidths: number;
}

/** Provisional acquisition settings, requiring webcam trials; these are NOT scoring/health limits. */
export const DEFAULT_CALIBRATION_OPTIONS: Readonly<CalibrationOptions> = {
  durationMs: 3000,
  minSamples: 20,
  sampleIntervalMs: 100,
  maxGapMs: 500,
  minVisibility: 0.7,
  minShoulderWidthFrameWidths: 0.1,
  maxMetricRangeShoulderWidths: 0.08,
  maxCenterRangeNormalized: 0.025,
  maxWidthRangeFrameWidths: 0.025,
};

export interface CalibrationReference {
  schemaVersion: 1;
  sourceId: string;
  widthPx: number;
  heightPx: number;
  startedAtMs: number;
  completedAtMs: number;
  sampleCount: number;
  metrics: FrontalMetrics;
}

export interface CalibrationState {
  phase: 'collecting' | 'ready';
  samples: readonly FrontalMeasurement[];
  progress: number;
  reason: CalibrationReason | null;
  reference: CalibrationReference | null;
}

export function createCalibration(): CalibrationState {
  return { phase: 'collecting', samples: [], progress: 0, reason: null, reference: null };
}

type MeasurementResult = { valid: true; measurement: FrontalMeasurement }
  | { valid: false; reason: CalibrationReason };

/**
 * Read projected frontal geometry, not anatomical forward-head angle or a posture score.
 * MediaPipe x/y are normalized by different image dimensions, so convert to pixels first.
 * https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js
 * The nose and both shoulders must be visible. A stable pose is not proof of a correct pose.
 */
export function extractFrontalMeasurement(
  frame: CalibrationFrame,
  options: Readonly<CalibrationOptions> = DEFAULT_CALIBRATION_OPTIONS,
): MeasurementResult {
  const { widthPx, heightPx, timestampMs, sourceId, landmarks } = frame;
  if (!Number.isFinite(timestampMs) || timestampMs < 0) return { valid: false, reason: 'invalid-time' };
  if (![widthPx, heightPx].every(value => Number.isFinite(value) && value > 0) || !sourceId) {
    return { valid: false, reason: 'invalid-frame' };
  }
  const nose = landmarks?.[0], left = landmarks?.[11], right = landmarks?.[12];
  if (!nose || !left || !right) return { valid: false, reason: 'missing-landmarks' };
  const points = [nose, left, right];
  if (points.some(point => point.visibility === undefined || !Number.isFinite(point.visibility)
    || point.visibility < options.minVisibility || point.visibility > 1)) {
    return { valid: false, reason: 'low-confidence' };
  }
  if (points.some(point => ![point.x, point.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1))) {
    return { valid: false, reason: 'out-of-frame' };
  }
  const shoulderSpanPx = Math.hypot((left.x - right.x) * widthPx, (left.y - right.y) * heightPx);
  // Reject a near side-on/collapsed horizontal span instead of dividing by a tiny denominator.
  if (Math.abs(left.x - right.x) < options.minShoulderWidthFrameWidths) {
    return { valid: false, reason: 'shoulders-too-close' };
  }
  const shoulderCenterX = (left.x + right.x) / 2;
  const shoulderCenterY = (left.y + right.y) / 2;
  return {
    valid: true,
    measurement: {
      sourceId, widthPx, heightPx, timestampMs, shoulderCenterX, shoulderCenterY,
      shoulderWidthFrameWidths: shoulderSpanPx / widthPx,
      noseOffsetShoulderWidths: (nose.x - shoulderCenterX) * widthPx / shoulderSpanPx,
      noseHeightShoulderWidths: (shoulderCenterY - nose.y) * heightPx / shoulderSpanPx,
      shoulderHeightDifferenceShoulderWidths: (left.y - right.y) * heightPx / shoulderSpanPx,
    },
  };
}

const metricKeys = ['noseOffsetShoulderWidths', 'noseHeightShoulderWidths',
  'shoulderHeightDifferenceShoulderWidths'] as const;
const centerKeys = ['shoulderCenterX', 'shoulderCenterY'] as const;

function range(samples: readonly FrontalMeasurement[], key: keyof FrontalMetrics | 'shoulderCenterX' | 'shoulderCenterY' | 'shoulderWidthFrameWidths') {
  const values = samples.map(sample => sample[key]);
  return Math.max(...values) - Math.min(...values);
}

function median(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sameCamera(a: { sourceId: string; widthPx: number; heightPx: number }, b: CalibrationFrame) {
  return a.sourceId === b.sourceId && a.widthPx === b.widthPx && a.heightPx === b.heightPx;
}

/**
 * Start explicitly after reference-pose guidance; call createCalibration() for every new session.
 * A continuous stable window is required: missing/uncertain frames erase pending samples.
 * Compare the whole window to catch slow drift; adjacent-frame checks would miss it.
 * Once ready, the reference stays fixed. Tracking validity must still be checked separately.
 * Camera identity/dimensions invalidate a reference; physical camera movement requires user reset.
 */
export function advanceCalibration(
  previous: CalibrationState,
  frame: CalibrationFrame,
  options: Readonly<CalibrationOptions> = DEFAULT_CALIBRATION_OPTIONS,
): CalibrationState {
  if (previous.reference && sameCamera(previous.reference, frame)) return previous;
  const result = extractFrontalMeasurement(frame, options);
  if (!result.valid) return { ...createCalibration(), reason: result.reason };
  const sample = result.measurement;
  let samples = previous.samples;
  let reason: CalibrationReason | null = null;
  const last = samples.at(-1);
  if ((last && !sameCamera(last, frame)) || previous.reference) {
    samples = [];
    reason = 'camera-changed';
  } else if (last && sample.timestampMs <= last.timestampMs) {
    return { ...createCalibration(), reason: 'invalid-time' };
  } else if (last && sample.timestampMs - last.timestampMs > options.maxGapMs) {
    samples = [];
    reason = 'interrupted';
  }
  samples = [...samples, sample];
  if (metricKeys.some(key => range(samples, key) > options.maxMetricRangeShoulderWidths)
    || centerKeys.some(key => range(samples, key) > options.maxCenterRangeNormalized)
    || range(samples, 'shoulderWidthFrameWidths') > options.maxWidthRangeFrameWidths) {
    samples = [sample];
    reason = 'moving';
  } else if (!reason && last && sample.timestampMs - last.timestampMs < options.sampleIntervalMs) {
    // Check every supplied frame for movement, even when not retaining it as a median sample.
    return previous;
  }
  const elapsedMs = sample.timestampMs - samples[0].timestampMs;
  const progress = Math.min(1, elapsedMs / options.durationMs, samples.length / options.minSamples);
  if (progress < 1) return { phase: 'collecting', samples, progress, reason, reference: null };
  const metrics: FrontalMetrics = {
    noseOffsetShoulderWidths: median(samples.map(value => value.noseOffsetShoulderWidths)),
    noseHeightShoulderWidths: median(samples.map(value => value.noseHeightShoulderWidths)),
    shoulderHeightDifferenceShoulderWidths: median(samples.map(value => value.shoulderHeightDifferenceShoulderWidths)),
  };
  return {
    phase: 'ready', samples, progress: 1, reason: null,
    reference: {
      schemaVersion: 1, sourceId: sample.sourceId, widthPx: sample.widthPx, heightPx: sample.heightPx,
      startedAtMs: samples[0].timestampMs, completedAtMs: sample.timestampMs,
      sampleCount: samples.length, metrics,
    },
  };
}
