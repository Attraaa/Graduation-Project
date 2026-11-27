import type { PostureSecond, PostureTimelineStart } from '../posture/scoreTimeline';

export const POSTURE_TIMELINE_BATCH_SIZE = 120;
export const POSTURE_TIMELINE_INTERVAL_MS = 1000;

const inRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
export const isPostureTimelineMeasure = (score: unknown, ms: unknown) =>
  inRange(ms, 0, POSTURE_TIMELINE_INTERVAL_MS) && (ms === 0 ? score === null : inRange(score, 0, 100));

export interface PostureTimelineBatch {
  owner: string;
  session: PostureTimelineStart;
  points: readonly PostureSecond[];
  endedAt: number | null;
}

export const postureTimelineHeader = (session: PostureTimelineStart) => ({
  type: 'session',
  schemaVersion: 1,
  id: session.id,
  startedAt: session.startedAt,
  sampleIntervalMs: POSTURE_TIMELINE_INTERVAL_MS,
  scoreAggregation: 'valid-time-weighted-mean',
  scorePolicyVersions: { neck: session.scorePolicyVersions.neck, shoulder: session.scorePolicyVersions.shoulder },
  habitPolicyVersion: session.habitPolicyVersion,
});

export const postureTimelineSample = (point: PostureSecond) => ({
  type: 'sample',
  second: point.second,
  neck: point.neck,
  shoulder: point.shoulder,
  neckValidMs: point.neckValidMs,
  shoulderValidMs: point.shoulderValidMs,
});

export const postureTimelineEnd = (endedAt: number) => ({ type: 'end', endedAt });
