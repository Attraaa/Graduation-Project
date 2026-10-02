import { emptyEyeTotals, eyeFields } from './eye.ts';
import type { EyeRecord, EyeBucket, EyeBatch } from './eye.ts';

export interface EyeSample { validMs: number; blinks: number; nearReminder: boolean; openReminder: boolean }
/** Receives every measurement sample, not the throttled UI snapshot. */
export class EyeRecorder {
  readonly record: EyeRecord;
  private startMono: number;
  private lastSample: number;
  private previous: EyeSample = { validMs: 0, blinks: 0, nearReminder: false, openReminder: false };
  private completed = 0;
  private buckets = new Map<number, EyeBucket>();
  private dirty = new Map<number, EyeBucket>();
  private committed = new Map<number, EyeBucket>();
  private sequence = 0;
  private pending: EyeBatch | null = null;
  constructor(record: EyeRecord, startMono: number) { this.record = { ...record }; this.startMono = startMono; this.lastSample = startMono; }
  private bucket(epoch: number) {
    const minute = Math.floor(epoch / 60000) * 60000;
    let bucket = this.buckets.get(minute);
    if (!bucket) { bucket = { minute, ...emptyEyeTotals() }; this.buckets.set(minute, bucket); }
    this.dirty.set(minute, bucket);
    return bucket;
  }
  private parts(from: number, to: number, add: (bucket: EyeBucket, ms: number) => void) {
    for (let at = from; at < to;) {
      const end = Math.min(to, (Math.floor(at / 60000) + 1) * 60000);
      add(this.bucket(at), end - at); at = end;
    }
  }
  advance(at: number) {
    if (this.record.status !== 'running' || !Number.isFinite(at)) return;
    const end = Math.max(this.record.updatedAt, this.record.startedAt + at - this.startMono);
    this.parts(this.record.updatedAt, end, (bucket, ms) => { bucket.runMs += ms; });
    this.record.updatedAt = end; this.record.runMs = end - this.record.startedAt;
  }
  sample(at: number, value: EyeSample) {
    if (this.record.status !== 'running' || !Number.isFinite(at) || at < this.lastSample) return;
    this.advance(at);
    const epoch = this.record.startedAt + at - this.startMono;
    const valid = value.validMs - this.previous.validMs;
    if (valid > 0 && valid <= at - this.lastSample + 0.01)
      this.parts(epoch - valid, epoch, (bucket, ms) => { bucket.validMs += ms; });
    const bucket = this.bucket(epoch);
    bucket.blinks += Math.max(0, value.blinks - this.previous.blinks);
    if (value.nearReminder && !this.previous.nearReminder) bucket.nearReminders += 1;
    if (value.openReminder && !this.previous.openReminder) bucket.openReminders += 1;
    this.previous = { ...value }; this.lastSample = at;
  }
  rest(at: number, completed: number) {
    if (this.record.status !== 'running' || completed <= this.completed) return;
    this.advance(at);
    this.bucket(this.record.updatedAt).breaks += completed - this.completed; this.completed = completed;
  }
  finish(at: number) { this.advance(at); this.record.status = 'finished'; }
  get hasPending() { return this.pending !== null || this.dirty.size > 0 || this.sequence === 0; }
  batch(generation: number): EyeBatch | null {
    if (this.pending) return this.pending;
    if (!this.hasPending && this.record.status === 'running') return null;
    const selected = [...this.dirty.values()].sort((a, b) => a.minute - b.minute).slice(0, 120).map(bucket => ({ ...bucket }));
    for (const bucket of selected) this.dirty.delete(bucket.minute);
    const snapshot = new Map(this.committed);
    for (const bucket of selected) snapshot.set(bucket.minute, bucket);
    const totals = emptyEyeTotals();
    for (const bucket of snapshot.values()) for (const field of eyeFields) totals[field] += bucket[field];
    this.pending = { schemaVersion: 1, generation, sequence: this.sequence,
      record: { ...this.record, ...totals, updatedAt: this.record.startedAt + totals.runMs,
        status: this.dirty.size ? 'running' : this.record.status }, buckets: selected };
    return this.pending;
  }
  acknowledge() {
    if (!this.pending) return;
    for (const bucket of this.pending.buckets) this.committed.set(bucket.minute, bucket);
    this.sequence += 1; this.pending = null;
  }
}
