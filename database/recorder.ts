import { emptyTotals, AGGREGATION_VERSION } from './contracts.ts';
import type { MinuteBucket, PostureRecord, RecordBatch, Totals } from './contracts.ts';

export interface CaptureEvaluation {
  validMs: number;
  scoreTimeSum: number;
  currentScore: number | null;
  deviationMs: number;
  deviationEpisodeCount: number;
}
const totalFields = ['runMs', 'validMs', 'scoreTimeSum', 'deviationMs', 'deviationEpisodeCount'] as const;

/** Every observation enters here, independently of the UI refresh rate. */
export class CaptureRecorder {
  readonly record: PostureRecord;
  private startMono: number;
  private elapsed = 0;
  private previous: { at: number; evaluation: CaptureEvaluation } | null = null;
  private continuousMs = 0;
  private buckets = new Map<number, MinuteBucket>();
  private dirty = new Map<number, MinuteBucket>();
  private committed = new Map<number, MinuteBucket>();
  private sequence = 0;
  private pending: RecordBatch | null = null;

  constructor(record: PostureRecord, startMono: number) { this.record = { ...record }; this.startMono = startMono; }

  private bucket(epoch: number) {
    const minute = Math.floor(epoch / 60_000) * 60_000;
    let bucket = this.buckets.get(minute);
    if (!bucket) { bucket = { minute, ...emptyTotals() }; this.buckets.set(minute, bucket); }
    this.dirty.set(minute, bucket);
    return bucket;
  }
  private parts(from: number, to: number, add: (bucket: MinuteBucket, start: number, end: number) => void) {
    let start = from;
    while (start < to) {
      const end = Math.min(to, (Math.floor(start / 60_000) + 1) * 60_000);
      add(this.bucket(start), start, end); start = end;
    }
  }
  advance(at: number) {
    if (this.record.status !== 'running' || !Number.isFinite(at)) return;
    const elapsed = Math.max(this.elapsed, at - this.startMono);
    this.parts(this.record.startedAt + this.elapsed, this.record.startedAt + elapsed, (bucket, a, b) => { bucket.runMs += b - a; });
    this.elapsed = elapsed;
    this.record.runMs = elapsed;
    this.record.updatedAt = this.record.startedAt + elapsed;
  }
  sample(at: number, evaluation: CaptureEvaluation) {
    if (this.record.status !== 'running' || !Number.isFinite(at) || at < this.startMono) return;
    this.advance(at);
    const old = this.previous;
    if (old && at <= old.at) { this.previous = { at: old.at, evaluation: { ...evaluation } }; this.continuousMs = 0; return; }
    if (old) {
      const valid = evaluation.validMs - old.evaluation.validMs;
      const scoreSum = evaluation.scoreTimeSum - old.evaluation.scoreTimeSum;
      const deviation = evaluation.deviationMs - old.evaluation.deviationMs;
      const episodes = evaluation.deviationEpisodeCount - old.evaluation.deviationEpisodeCount;
      if (valid > 0 && valid <= 500.01 && scoreSum >= 0 && old.evaluation.currentScore !== null && evaluation.currentScore !== null) {
        // Use accepted cumulative differences; divide the trapezoid at real minute boundaries.
        const to = this.record.startedAt + at - this.startMono;
        const from = to - valid;
        const span = to - from;
        const s0 = old.evaluation.currentScore, s1 = evaluation.currentScore;
        const expected = (s0 + s1) / 2 * valid;
        this.parts(from, to, (bucket, a, b) => {
          const duration = valid * (b - a) / span;
          const left = s0 + (s1 - s0) * (a - from) / span;
          const right = s0 + (s1 - s0) * (b - from) / span;
          bucket.validMs += duration;
          bucket.scoreTimeSum += expected > 0 ? (left + right) / 2 * duration * scoreSum / expected : 0;
          bucket.deviationMs += Math.max(0, deviation) * (b - a) / span;
        });
        this.continuousMs += valid;
        this.record.longestContinuousMs = Math.max(this.record.longestContinuousMs, this.continuousMs);
      } else { this.continuousMs = 0; }
      if (episodes > 0) this.bucket(this.record.startedAt + at - this.startMono).deviationEpisodeCount += episodes;
    }
    this.previous = { at, evaluation: { ...evaluation } };
  }
  finish(at: number) { this.advance(at); this.record.status = 'finished'; }
  get hasPending() { return this.pending !== null || this.dirty.size > 0 || this.sequence === 0; }

  batch(generation: number): RecordBatch | null {
    if (this.pending) return this.pending;
    if (!this.hasPending && this.record.status === 'running') return null;
    const selected = [...this.dirty.values()].sort((a, b) => a.minute - b.minute).slice(0, 120).map(bucket => ({ ...bucket }));
    for (const bucket of selected) this.dirty.delete(bucket.minute);
    const snapshot = new Map(this.committed);
    for (const bucket of selected) snapshot.set(bucket.minute, bucket);
    const totals: Totals = emptyTotals();
    for (const bucket of snapshot.values()) for (const key of totalFields) totals[key] += bucket[key];
    this.pending = { schemaVersion: 1, aggregationPolicyVersion: AGGREGATION_VERSION, generation, sequence: this.sequence,
      record: { ...this.record, ...totals, updatedAt: this.record.startedAt + totals.runMs,
        longestContinuousMs: Math.min(this.record.longestContinuousMs, totals.validMs), status: this.dirty.size ? 'running' : this.record.status }, buckets: selected };
    return this.pending;
  }
  acknowledge() {
    if (!this.pending) return;
    for (const bucket of this.pending.buckets) this.committed.set(bucket.minute, bucket);
    this.sequence += 1; this.pending = null;
  }
}
