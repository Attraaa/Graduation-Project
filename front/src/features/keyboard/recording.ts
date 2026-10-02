import { keyboardCountKey, KEYBOARD_CODES, RECOGNITION_VERSION } from '../../../../database/keyboard';
import type { KeyboardBatch, KeyboardCount, KeyboardRecord } from '../../../../database/keyboard';
import { localDateKey } from '../../../../database/contracts';
import { recordsApi, recordValue } from '../records/api';
import { announceRecording, registerRecorder } from '../records/recording';
import { getCurrentUser } from '../../utils/authStore';
import { ANSI_QWERTY_TOUCH_POLICY_V1 } from './fingerPolicy';
import type { KeyboardLiveResult } from './runtime';

export class KeyboardCollector {
  readonly counts = new Map<string, KeyboardCount>();
  sequence = 0;
  private pending: KeyboardBatch | null = null;
  private seen = new Set<number>();
  readonly record: KeyboardRecord;
  constructor(record: KeyboardRecord) { this.record = record; }
  press(result: KeyboardLiveResult, epoch: number) {
    if (this.record.status !== 'running' || !KEYBOARD_CODES.has(result.code) || this.seen.has(result.id)) return;
    this.seen.add(result.id);
    // Sequence IDs are only transient deduplication metadata and are never stored.
    if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value!);
    this.record.updatedAt = Math.max(epoch, this.record.updatedAt);
    const row: KeyboardCount = { date: localDateKey(this.record.updatedAt, this.record.offsetMinutes), code: result.code,
      context: result.context, finger: result.evaluation.observed, verdict: result.evaluation.verdict,
      reason: result.evaluation.reason, count: 1 };
    const key = keyboardCountKey(row), previous = this.counts.get(key);
    this.counts.set(key, { ...row, count: (previous?.count ?? 0) + 1 }); this.record.total += 1;
  }
  finish(epoch: number) { if (this.record.status === 'running') { this.record.updatedAt = Math.max(epoch, this.record.updatedAt); this.record.status = 'finished'; this.seen.clear(); } }
  batch(generation: number) {
    return this.pending ??= { schemaVersion: 1, generation, sequence: this.sequence,
      record: { ...this.record }, counts: [...this.counts.values()].map(row => ({ ...row })) };
  }
  acknowledge() { this.pending = null; this.sequence += 1; }
}
type Active = { collector: KeyboardCollector; generation: Promise<number>; timer: ReturnType<typeof setInterval>;
  saving: Promise<void> | null; error: string | null; now(): number };
const active = new Set<Active>();
async function save(entry: Active): Promise<void> {
  if (entry.saving) return entry.saving;
  entry.saving = (async () => {
    try {
      const generation = await entry.generation;
      if (!active.has(entry)) return;
      do {
        const batch = entry.collector.batch(generation);
        await recordValue(recordsApi().writeKeyboard(batch));
        entry.collector.acknowledge();
        if (batch.record.status !== 'running') { active.delete(entry); break; }
      } while (entry.collector.record.status !== 'running');
      entry.error = null; announceRecording('키보드 집계가 이 PC에 저장되었습니다.');
    } catch (error) {
      if (!active.has(entry)) return;
      entry.error = error instanceof Error ? error.message : String(error);
      entry.generation = recordValue(recordsApi().generation(entry.collector.record.owner));
      void entry.generation.catch(() => {});
      announceRecording('키보드 집계 저장 실패'); throw error;
    } finally { entry.saving = null; }
  })();
  return entry.saving;
}
registerRecorder({
  retry: () => Promise.all([...active].map(save)).then(() => {}),
  finish: () => active.forEach(entry => { clearInterval(entry.timer); entry.collector.finish(entry.now()); }),
  discard: owner => { for (const entry of active) if (entry.collector.record.owner === owner) { clearInterval(entry.timer); entry.collector.finish(entry.now()); active.delete(entry); } },
  error: () => [...active].find(entry => entry.error)?.error ?? null,
});
export function beginKeyboardRecording() {
  const owner = getCurrentUser()?.id;
  const noop = { press: () => {}, finish: () => {} };
  if (!owner || !window.motiRecords) { announceRecording('키보드 집계 저장은 로그인한 데스크톱 앱에서 사용할 수 있습니다.'); return noop; }
  const epoch = Date.now(), start = performance.now(), now = () => Math.round(epoch + performance.now() - start);
  const collector = new KeyboardCollector({ id: crypto.randomUUID(), owner, startedAt: epoch, updatedAt: epoch,
    offsetMinutes: new Date(epoch).getTimezoneOffset(), status: 'running',
    policyVersion: `${ANSI_QWERTY_TOUCH_POLICY_V1.id}:${ANSI_QWERTY_TOUCH_POLICY_V1.version}`,
    recognitionVersion: RECOGNITION_VERSION, nearbyCredit: 70, total: 0 });
  const generation = recordValue(recordsApi().generation(owner)); void generation.catch(() => {});
  const entry: Active = { collector, generation, saving: null, error: null, now,
    timer: setInterval(() => { void save(entry).catch(() => {}); }, 5000) };
  active.add(entry); announceRecording('키보드 집계 저장 중');
  return { press: (result: KeyboardLiveResult) => { if (active.has(entry)) collector.press(result, now()); },
    finish: () => { clearInterval(entry.timer); collector.finish(now()); void save(entry).catch(() => {}); } };
}
