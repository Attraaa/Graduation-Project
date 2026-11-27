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

export function localPostureReview(sessions: ReviewSession[], since: number): LocalPostureReview | null {
  const current = sessions.filter(s => s.startedAt >= since).sort((a, b) => b.startedAt - a.startedAt);
  const previous = sessions.filter(s => s.startedAt < since);
  if (!current.length) return null;
  const policies = {
    neck: (current.find(s => s.neck.validMs > 0) ?? current[0]).scorePolicyVersions.neck,
    shoulder: (current.find(s => s.shoulder.validMs > 0) ?? current[0]).scorePolicyVersions.shoulder,
  };
  const pair = (key: 'neck' | 'shoulder') => ({ current: mean(current, key, policies[key]), previous: mean(previous, key, policies[key]) });
  return { sessions: current.length, measuredMinutes: round(current.reduce((n, s) => n + s.endedAt - s.startedAt, 0) / 60_000),
    sideMetric: policies.shoulder.startsWith('upper-body-balance-') ? 'balance' : 'shoulder',
    neck: pair('neck'), side: pair('shoulder'), latestNeckBand: current[0].neck.mostObservedBand };
}
