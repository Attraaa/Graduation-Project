import { localDateKey } from '../../../../database/contracts.ts';
import type { LocalPostureReview, ObservedBand } from '../../../../database/localReview.ts';

type Part = { validMs: number; meanPoints: number | null; mostObservedBand: ObservedBand | null };
export interface ReviewSession {
  startedAt: number; endedAt: number;
  scorePolicyVersions: { neck: string; shoulder: string };
  neck: Part; shoulder: Part;
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

const round = (n: number) => Math.round(n * 10) / 10;
function mean(rows: ReviewSession[], key: 'neck' | 'shoulder', version: string) {
  let ms = 0, sum = 0;
  for (const row of rows) {
    const p = row[key];
    if (row.scorePolicyVersions[key] !== version || p.meanPoints === null) continue;
    sum += p.meanPoints * p.validMs;
    ms += p.validMs;
  }
  return ms ? round(sum / ms) : null;
}

/** Sessions of the period, newest first, and the score policies of the latest one (older policies are not mixed in). */
function currentOf(sessions: ReviewSession[], since: number) {
  const current = sessions.filter(s => s.startedAt >= since).sort((a, b) => b.startedAt - a.startedAt);
  const policies = current.length ? {
    neck: (current.find(s => s.neck.validMs > 0) ?? current[0]).scorePolicyVersions.neck,
    shoulder: (current.find(s => s.shoulder.validMs > 0) ?? current[0]).scorePolicyVersions.shoulder,
  } : null;
  return { current, policies };
}
const startDate = (session: ReviewSession) => localDateKey(session.startedAt, new Date(session.startedAt).getTimezoneOffset());

export function localPostureReview(sessions: ReviewSession[], since: number): LocalPostureReview | null {
  const { current, policies } = currentOf(sessions, since);
  const previous = sessions.filter(s => s.startedAt < since);
  if (!policies) return null;
  const pair = (key: 'neck' | 'shoulder') => ({ current: mean(current, key, policies[key]), previous: mean(previous, key, policies[key]) });
  // Sessions are grouped by the hour they started; minutes are the longer of neck and side observation.
  const byHour = new Map<number, ReviewSession[]>();
  for (const session of current) {
    const hour = new Date(session.startedAt).getHours();
    byHour.set(hour, [...(byHour.get(hour) ?? []), session]);
  }
  const hourly = [...byHour].sort(([a], [b]) => a - b).map(([hour, rows]) => ({ hour,
    neck: mean(rows, 'neck', policies.neck), side: mean(rows, 'shoulder', policies.shoulder),
    minutes: round(rows.reduce((n, s) => n + Math.max(s.neck.validMs, s.shoulder.validMs), 0) / 60_000) }));
  return { sessions: current.length, measuredMinutes: round(current.reduce((n, s) => n + s.endedAt - s.startedAt, 0) / 60_000),
    sideMetric: policies.shoulder.startsWith('upper-body-balance-') ? 'balance' : 'shoulder',
    neck: pair('neck'), side: pair('shoulder'), latestNeckBand: current[0].neck.mostObservedBand,
    hourly, longestMinutes: round(Math.max(...current.map(s => s.endedAt - s.startedAt)) / 60_000) };
}

/** Neck and side means per local start date, for each date of the period (null where nothing was measured). */
export function localPostureDaily(sessions: ReviewSession[], since: number, dates: string[]) {
  const { current, policies } = currentOf(sessions, since);
  return dates.map(date => {
    const day = current.filter(session => startDate(session) === date);
    return { date, neck: policies && day.length ? mean(day, 'neck', policies.neck) : null, side: policies && day.length ? mean(day, 'shoulder', policies.shoulder) : null };
  });
}
