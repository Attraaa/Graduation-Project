import type { RecordDetail } from '../../../../database/contracts.ts';
import type { DailyPostureReview, DailyPostureScore, ScorePeriod } from '../../../../database/localReview.ts';
import { recordsApi, recordValue } from './api.ts';
import { readBrowserPostureDay } from './postureTimelineBrowser.ts';
import type { DailyTimelineSession } from './reviewSession.ts';

const MINUTE = 60_000;
const WINDOW = 5 * MINUTE;
type Metric = DailyPostureScore['metric'];
type Span = { start: number; end: number };
type Sample = Span & { mean: number; valid: number };
type Track = { id: string; metric: Metric; policy: string; samples: Sample[]; untimed: Sample | null } & Span;

const round = (n: number, decimals: number) => Number(n.toFixed(decimals));
const minute = (ms: number) => round(ms / MINUTE, 6);

function sessionId(recordId: string) {
  return recordId.replace(/^camera:[a-z\d-]+:/i, '').replace(/:(turtle|balance)$/, '');
}

function deviceTracks(session: DailyTimelineSession): Track[] {
  const { id, startedAt: start, endedAt: end, scorePolicyVersions } = session;
  const side: Metric = scorePolicyVersions.shoulder.startsWith('upper-body-balance-') ? 'balance' : 'shoulder';
  return (['neck', 'shoulder'] as const).map(key => {
    const ms = key === 'neck' ? 'neckValidMs' : 'shoulderValidMs';
    const samples = session.points.flatMap(point => {
      const at = start + (point.second - 1) * 1000;
      const until = Math.min(at + 1000, end);
      const mean = point[key];
      return mean === null || until <= at ? [] : [{ start: at, end: until, mean, valid: point[ms] }];
    });
    const part = session[key];
    const untimed = !session.points.length && part.meanPoints !== null
      ? { start, end, mean: part.meanPoints, valid: part.validMs } : null;
    return { id, start, end, metric: key === 'neck' ? key : side, policy: scorePolicyVersions[key], samples, untimed };
  });
}

function cloudTrack({ record, buckets }: RecordDetail): Track {
  const { id, startedAt: start, updatedAt: end, mode, scorePolicyVersion: policy } = record;
  const samples = buckets.flatMap(bucket => {
    if (bucket.validMs <= 0) return [];
    return [{ start: Math.max(bucket.minute, start), end: Math.min(bucket.minute + MINUTE, end),
      mean: bucket.scoreTimeSum / bucket.validMs, valid: bucket.validMs }];
  });
  return { id: sessionId(id), start, end, metric: mode === 'balance' ? 'balance' : 'neck', policy, samples, untimed: null };
}

type Totals = { weighted: number; valid: number };
const totals = (): Totals => ({ weighted: 0, valid: 0 });
const add = (target: Totals, score: number, valid: number) => { target.weighted += score * valid; target.valid += valid; };
function result(t: Totals, duration: number): ScorePeriod | null {
  const validMinutes = minute(Math.min(t.valid, duration));
  return validMinutes > 0 ? { mean: round(Math.min(100, Math.max(0, t.weighted / t.valid)), 1), validMinutes } : null;
}

/** The day clock counts elapsed time during measurements, skipping the time between them. */
function measurementClock(tracks: Track[], from: number, to: number) {
  const windows: (Span & { elapsed: number })[] = [];
  let duration = 0;
  for (const t of [...tracks].sort((a, b) => a.start - b.start)) {
    const start = Math.max(t.start, from), end = Math.min(t.end, to);
    const previous = windows.at(-1);
    if (previous && start <= previous.end) {
      duration += Math.max(0, end - previous.end);
      previous.end = Math.max(previous.end, end);
    } else {
      windows.push({ start, end, elapsed: duration });
      duration += end - start;
    }
  }
  const elapsedAt = (at: number) => {
    let low = 0, high = windows.length - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1, window = windows[middle];
      if (at < window.start) high = middle - 1;
      else if (at > window.end) low = middle + 1;
      else return window.elapsed + at - window.start;
    }
    throw new Error('측정 시간 범위가 올바르지 않습니다.');
  };
  return { duration, elapsedAt };
}

export function summarizePostureDay(local: DailyTimelineSession[], cloud: RecordDetail[], from: number, to: number): DailyPostureReview | null {
  const trackKey = (t: Track) => `${t.id}:${t.metric}`;
  const tracksById = new Map(cloud.map(cloudTrack).map(t => [trackKey(t), t]));
  for (const t of local.flatMap(deviceTracks)) {
    if (t.samples.length || !tracksById.has(trackKey(t))) tracksById.set(trackKey(t), t);
  }
  const tracks = [...tracksById.values()].filter(t => Math.min(t.end, to) > Math.max(t.start, from));
  const { duration, elapsedAt } = measurementClock(tracks, from, to);
  if (duration <= 0) return null;
  const cutoff = Math.max(0, duration - 10 * MINUTE);
  const scores: DailyPostureScore[] = [];
  for (const metric of ['neck', 'balance', 'shoulder'] as const) {
    const measured = tracks.filter(t => t.metric === metric
      && (t.samples.some(sample => sample.end > from && sample.start < to)
        || (t.untimed && t.start >= from && t.end <= to)));
    const latest = measured.reduce<Track | undefined>((a, b) => !a || b.end > a.end ? b : a, undefined);
    if (!latest) continue;
    const mixedPolicy = measured.some(t => t.policy !== latest.policy);
    const bins = new Map<number, Totals>();
    const overall = totals(), before = totals(), last = totals();
    for (const track of measured.filter(t => t.policy === latest.policy)) {
      if (track.untimed) add(overall, track.untimed.mean, track.untimed.valid);
      for (const sample of track.samples) {
        const start = Math.max(sample.start, from), end = Math.min(sample.end, to);
        if (start >= end) continue;
        const fromMs = elapsedAt(start), toMs = elapsedAt(end);
        const ratio = Math.min(1, sample.valid / (sample.end - sample.start));
        add(overall, sample.mean, (toMs - fromMs) * ratio);
        if (mixedPolicy) continue;
        add(before, sample.mean, Math.max(0, Math.min(toMs, cutoff) - fromMs) * ratio);
        add(last, sample.mean, Math.max(0, toMs - Math.max(fromMs, cutoff)) * ratio);
        for (let at = fromMs; at < toMs;) {
          const index = Math.floor(at / WINDOW), next = Math.min(toMs, (index + 1) * WINDOW);
          const bin = bins.get(index) ?? totals();
          add(bin, sample.mean, (next - at) * ratio);
          bins.set(index, bin);
          at = next;
        }
      }
    }
    const average = result(overall, duration);
    if (!average) continue;
    const periods = [...bins].sort(([a], [b]) => a - b).flatMap(([index, t]) => {
      const start = index * WINDOW, end = Math.min(duration, start + WINDOW);
      const bin = result(t, end - start);
      return bin && bin.validMinutes > 0 ? [{ startMinute: minute(start), endMinute: minute(end), ...bin }] : [];
    });
    scores.push({ metric, policyVersion: latest.policy, ...average, beforeLastTen: result(before, cutoff),
      lastTen: result(last, duration - cutoff), periods });
  }
  return scores.length ? { sessions: new Set(tracks.map(t => t.id)).size, measuredMinutes: minute(duration), scores } : null;
}

export async function loadDailyPosture(owner: string, date: string, signal?: AbortSignal): Promise<DailyPostureReview | null> {
  const midnight = new Date(`${date}T00:00:00`);
  const tomorrow = new Date(midnight);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const from = midnight.getTime(), to = tomorrow.getTime();
  const loadLocal = window.motiRecords?.readPostureDay ?? readBrowserPostureDay;
  const api = recordsApi();
  const [device, synced] = await Promise.allSettled([
    loadLocal(owner, from, to),
    recordValue(api.statistics({ owner, from: date, to: date })),
  ]);
  signal?.throwIfAborted();
  if (device.status === 'rejected') throw device.reason;
  if (synced.status === 'rejected') {
    const local = summarizePostureDay(device.value, [], from, to);
    if (local) return local;
    throw synced.reason;
  }
  const available = new Set(device.value.flatMap(session => {
    const tracks = deviceTracks(session);
    return tracks.filter(t => t.samples.some(sample => sample.end > from && sample.start < to))
      .map(t => `${t.id}:${t.metric}`);
  }));
  const ids = new Set(synced.value.flatMap(row => {
    const metric = row.mode === 'balance' ? 'balance' : 'neck';
    return row.recordIds.filter(id => !available.has(`${sessionId(id)}:${metric}`));
  }));
  const details: RecordDetail[] = [];
  const queue = [...ids];
  for (let start = 0; start < queue.length; start += 8) {
    const batch = await Promise.all(queue.slice(start, start + 8).map(id => recordValue(api.detail(owner, id))));
    signal?.throwIfAborted();
    details.push(...batch);
  }
  return summarizePostureDay(device.value, details, from, to);
}
