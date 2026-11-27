import type { PostureSecond, PostureTimelineStart } from '../posture/scoreTimeline.ts';
import { POSTURE_TIMELINE_INTERVAL_MS } from './postureTimelineContract.ts';

const BAND_WIDTH = 5;
const BAND_COUNT = 20;
const round = (value: number) => Math.round(value * 10) / 10;

type ScoreTotals = { validMs: number; scoreTimeSum: number };
const emptyTotals = (): ScoreTotals => ({ validMs: 0, scoreTimeSum: 0 });
const mean = (totals: ScoreTotals) => totals.validMs ? round(totals.scoreTimeSum / totals.validMs) : null;

function summarizePart(points: readonly PostureSecond[], part: 'neck' | 'shoulder', splitAfterSecond: number, elapsedMs: number) {
  const overall = emptyTotals();
  const firstHalf = emptyTotals();
  const secondHalf = emptyTotals();
  const bandTimes = Array<number>(BAND_COUNT).fill(0);
  const validTime = part === 'neck' ? 'neckValidMs' : 'shoulderValidMs';

  for (const point of points) {
    const score = point[part];
    const validMs = point[validTime];
    if (score === null || validMs <= 0) continue;
    const scoreTimeSum = score * validMs;
    const half = point.second <= splitAfterSecond ? firstHalf : secondHalf;
    overall.validMs += validMs;
    overall.scoreTimeSum += scoreTimeSum;
    half.validMs += validMs;
    half.scoreTimeSum += scoreTimeSum;
    const band = Math.min(BAND_COUNT - 1, Math.floor(score / BAND_WIDTH));
    bandTimes[band] += validMs;
  }

  const longestBandMs = Math.max(...bandTimes);
  const longestBand = bandTimes.indexOf(longestBandMs);
  const average = (totals: ScoreTotals) => ({ validMs: Math.round(totals.validMs), meanPoints: mean(totals) });

  return {
    ...average(overall),
    observedPercentOfSession: elapsedMs > 0 ? round(Math.min(100, overall.validMs / elapsedMs * 100)) : 0,
    mostObservedBand: longestBandMs > 0 ? {
      fromPoints: longestBand * BAND_WIDTH,
      toPoints: (longestBand + 1) * BAND_WIDTH,
      includesUpperBound: longestBand === BAND_COUNT - 1,
      percentOfValidTime: round(longestBandMs / overall.validMs * 100),
    } : null,
    firstHalf: average(firstHalf),
    secondHalf: average(secondHalf),
  };
}

export function buildPostureTimelineSummary(session: PostureTimelineStart, endedAt: number, points: readonly PostureSecond[]) {
  const elapsedMs = endedAt - session.startedAt;
  const splitAfterSecond = Math.floor(points.length / 2);
  return {
    type: 'posture-session-summary',
    schemaVersion: 1,
    id: session.id,
    startedAt: session.startedAt,
    endedAt,
    elapsedMs: Math.round(elapsedMs),
    sampleIntervalMs: POSTURE_TIMELINE_INTERVAL_MS,
    sampledSeconds: points.length,
    splitAfterSecond,
    scoreUnit: 'points',
    scoreRange: [0, 100],
    scoreMeaning: session.scorePolicyVersions.neck.startsWith('upper-body-neck-e19-')
      ? 'neck: 100 minus estimated load score; shoulder: calibrated left-right balance' : 'similarity to the calibrated posture reference',
    scoreAggregation: 'weighted by valid observation time',
    scorePolicyVersions: { neck: session.scorePolicyVersions.neck, shoulder: session.scorePolicyVersions.shoulder },
    habitPolicyVersion: session.habitPolicyVersion,
    neck: summarizePart(points, 'neck', splitAfterSecond, elapsedMs),
    shoulder: summarizePart(points, 'shoulder', splitAfterSecond, elapsedMs),
  };
}
