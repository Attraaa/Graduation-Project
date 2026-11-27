import type { CaptureEvaluation } from '../../../../database/recorder.ts';

export interface PostureTimelineStart {
  id: string;
  startedAt: number;
  scorePolicyVersions: { neck: string; shoulder: string };
  habitPolicyVersion: string;
}

export interface PostureSecond {
  /** 1 is [0 ms, 1000 ms) from the paired record start. */
  second: number;
  neck: number | null;
  shoulder: number | null;
  neckValidMs: number;
  shoulderValidMs: number;
}

export interface PostureTimelineSink {
  append(points: readonly PostureSecond[]): void;
  finish(endedAt: number): void;
}

type ScoreSample = Pick<CaptureEvaluation, 'currentScore' | 'validMs' | 'scoreTimeSum'>;
type ScoreTotal = { validMs: number; scoreTimeSum: number };
type Part = 'neck' | 'shoulder';
type Observation = { elapsed: number; score: ScoreSample };
const SECOND_MS = 1000;
const BATCH_SIZE = 120;

/** Derives one-second averages from the same accepted score intervals as the posture recorder. */
export function createPostureScoreTimeline(
  startMono: number,
  append: (points: readonly PostureSecond[]) => void,
) {
  let nextSecond = 1;
  const previous: Partial<Record<Part, Observation>> = {};
  const bins = new Map<number, Record<Part, ScoreTotal>>();

  const collect = (part: Part, earlier: Observation, current: Observation) => {
    const first = earlier.score;
    const last = current.score;
    const duration = Math.min(last.validMs - first.validMs, current.elapsed - earlier.elapsed);
    const scoreTimeSum = last.scoreTimeSum - first.scoreTimeSum;
    if (!(duration > 0) || !(scoreTimeSum >= 0) || first.currentScore === null || last.currentScore === null) return;

    const intervalStart = current.elapsed - duration;
    const delta = last.currentScore - first.currentScore;
    // The evaluator integrates between consecutive accepted frames. Split that same interval at second boundaries.
    const expected = (first.currentScore + last.currentScore) * duration / 2;
    let from = Math.max(intervalStart, (nextSecond - 1) * SECOND_MS);
    while (from < current.elapsed) {
      const second = Math.floor(from / SECOND_MS) + 1;
      const to = Math.min(current.elapsed, second * SECOND_MS);
      let bin = bins.get(second);
      if (!bin) {
        bin = { neck: { validMs: 0, scoreTimeSum: 0 }, shoulder: { validMs: 0, scoreTimeSum: 0 } };
        bins.set(second, bin);
      }
      const left = first.currentScore + delta * (from - intervalStart) / duration;
      const right = first.currentScore + delta * (to - intervalStart) / duration;
      const span = to - from;
      bin[part].validMs += span;
      bin[part].scoreTimeSum += expected > 0 ? (left + right) / 2 * span * scoreTimeSum / expected : 0;
      from = to;
    }
  };

  const flush = (at: number) => {
    if (!Number.isFinite(at)) return;
    const completed = Math.floor((at - startMono) / SECOND_MS);
    let points: PostureSecond[] = [];
    while (nextSecond <= completed) {
      const bin = bins.get(nextSecond);
      const average = (total: ScoreTotal | undefined) => total?.validMs
        ? Math.min(100, Math.max(0, total.scoreTimeSum / total.validMs)) : null;
      points.push({ second: nextSecond, neck: average(bin?.neck), shoulder: average(bin?.shoulder),
        neckValidMs: Math.min(SECOND_MS, bin?.neck.validMs ?? 0), shoulderValidMs: Math.min(SECOND_MS, bin?.shoulder.validMs ?? 0) });
      bins.delete(nextSecond);
      nextSecond += 1;
      if (points.length === BATCH_SIZE) {
        append(points);
        points = [];
      }
    }
    if (points.length) append(points);
  };

  return {
    sample(part: Part, at: number, score: ScoreSample) {
      const elapsed = at - startMono;
      const earlier = previous[part];
      if (!Number.isFinite(elapsed) || elapsed < 0 || (earlier && elapsed <= earlier.elapsed)) return;
      const current = { elapsed, score };
      if (earlier) collect(part, earlier, current);
      previous[part] = current;
      // E19 can finish after a newer balance frame. Commit when both streams have passed the boundary.
      if (previous.neck && previous.shoulder) flush(startMono + Math.min(previous.neck.elapsed, previous.shoulder.elapsed));
    },
    finish(at: number) {
      if (Number.isFinite(at) && at > startMono) flush(startMono + Math.ceil((at - startMono) / SECOND_MS) * SECOND_MS);
    },
  };
}
