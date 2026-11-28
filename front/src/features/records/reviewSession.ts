import type { PostureSecond } from '../posture/scoreTimeline.ts';
import { isPostureTimelineMeasure } from './postureTimelineContract.ts';
import type { ObservedBand } from '../../../../database/localReview.ts';

type Part = { validMs: number; meanPoints: number | null; mostObservedBand: ObservedBand | null };
export interface ReviewSession {
  startedAt: number; endedAt: number;
  scorePolicyVersions: { neck: string; shoulder: string };
  neck: Part; shoulder: Part;
}

export interface DailyTimelineSession extends ReviewSession {
  id: string;
  points: PostureSecond[];
}

export function readDailyTimelineSession(value: unknown, from: number, to: number) {
  const row = value as { id?: unknown; startedAt?: number; endedAt?: number } | null;
  if (!row || typeof row.id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.id)
    || row.startedAt === undefined || row.endedAt === undefined || row.startedAt >= to || row.endedAt <= from) return null;
  const session = readReviewSession(value, 0, to);
  return session && { ...session, id: row.id };
}

export function readPostureSecond(value: unknown, second: number): PostureSecond | null {
  const row = value as (PostureSecond & { type?: unknown }) | null;
  if (row?.type !== 'sample' || row.second !== second
    || !isPostureTimelineMeasure(row.neck, row.neckValidMs) || !isPostureTimelineMeasure(row.shoulder, row.shoulderValidMs)) return null;
  return row;
}

const finite = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
function part(value: unknown, elapsed: number): Part | null {
  const p = value as Partial<Part> | null;
  if (!p || !finite(p.validMs, Math.ceil(elapsed)) || !(finite(p.meanPoints, 100) || (p.meanPoints === null && p.validMs === 0))) return null;
  const b = p.mostObservedBand;
  const band = b && finite(b.fromPoints, 100) && finite(b.toPoints, 100) && b.fromPoints < b.toPoints && finite(b.percentOfValidTime, 100)
    ? { fromPoints: b.fromPoints, toPoints: b.toPoints, percentOfValidTime: b.percentOfValidTime } : null;
  return { validMs: p.validMs, meanPoints: p.meanPoints, mostObservedBand: band };
}

/** Reads the same versioned summaries produced by older desktop installations. */
export function readReviewSession(value: unknown, from: number, to: number): ReviewSession | null {
  const row = value as Partial<ReviewSession> & { type?: unknown; schemaVersion?: unknown } | null;
  if (row?.type !== 'posture-session-summary' || row.schemaVersion !== 1 || !finite(row.startedAt, 8.64e15)
    || !finite(row.endedAt, 8.64e15) || row.endedAt < row.startedAt || row.startedAt < from || row.startedAt >= to
    || typeof row.scorePolicyVersions?.neck !== 'string' || typeof row.scorePolicyVersions.shoulder !== 'string') return null;
  const elapsed = row.endedAt - row.startedAt;
  const neck = part(row.neck, elapsed), shoulder = part(row.shoulder, elapsed);
  if (!neck || !shoulder || !(neck.validMs || shoulder.validMs)) return null;
  return { startedAt: row.startedAt, endedAt: row.endedAt,
    scorePolicyVersions: { neck: row.scorePolicyVersions.neck, shoulder: row.scorePolicyVersions.shoulder }, neck, shoulder };
}
