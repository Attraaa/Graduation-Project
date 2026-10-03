import { EyeRecorder } from '../../../../database/eyeRecorder';
import type { EyeSample } from '../../../../database/eyeRecorder';
import { emptyEyeTotals } from '../../../../database/eye';
import { getCurrentUser } from '../../utils/authStore';
import { recordsApi, recordValue } from '../records/api';
import { registerRecorder, announceRecording } from '../records/recording';
import { eyePolicy } from './eyePolicy';

type Active = { collector: EyeRecorder; generation: Promise<number>; timer: ReturnType<typeof setInterval>;
  saving: Promise<void> | null; error: string | null };
const active = new Set<Active>();
async function save(entry: Active): Promise<void> {
  if (entry.saving) return entry.saving;
  entry.saving = (async () => {
    try {
      const generation = await entry.generation;
      if (!active.has(entry)) return;
      do {
        const batch = entry.collector.batch(generation);
        if (!batch) break;
        await recordValue(recordsApi().writeEye(batch));
        if (!active.has(entry)) return;
        entry.collector.acknowledge();
        if (batch.record.status !== 'running') { active.delete(entry); break; }
      } while (entry.collector.record.status !== 'running' || entry.collector.hasPending);
      entry.error = null; announceRecording('안구 기록이 서버에 저장되었습니다.');
    } catch (error) {
      if (!active.has(entry)) return;
      entry.error = error instanceof Error ? error.message : String(error);
      entry.generation = recordValue(recordsApi().generation(entry.collector.record.owner));
      void entry.generation.catch(() => {});
      announceRecording('안구 기록 저장 실패'); throw error;
    } finally { entry.saving = null; }
  })();
  return entry.saving;
}
registerRecorder({
  retry: () => Promise.all([...active].map(save)).then(() => {}),
  finish: () => active.forEach(entry => { clearInterval(entry.timer); entry.collector.finish(performance.now()); }),
  discard: owner => { for (const entry of active) if (entry.collector.record.owner === owner) {
    clearInterval(entry.timer); entry.collector.finish(performance.now()); active.delete(entry);
  } },
  error: () => [...active].find(entry => entry.error)?.error ?? null,
});
export interface EyeSink { sample(at: number, value: EyeSample): void; rest(completed: number): void; finish(): void }
export function beginEyeRecording(): EyeSink {
  const owner = getCurrentUser()?.id;
  const noop = { sample: () => {}, rest: () => {}, finish: () => {} };
  if (!owner) {
    announceRecording('로그인하면 안구 기록을 서버에 저장할 수 있습니다. 현재 측정은 저장되지 않습니다.');
    return noop;
  }
  const epoch = Date.now(), at = performance.now();
  const collector = new EyeRecorder({ ...emptyEyeTotals(), id: crypto.randomUUID(), owner, mode: 'eye',
    startedAt: epoch, updatedAt: epoch, offsetMinutes: new Date(epoch).getTimezoneOffset(), policyVersion: eyePolicy.version, status: 'running' }, at);
  const generation = recordValue(recordsApi().generation(owner)); void generation.catch(() => {});
  const entry: Active = { collector, generation, saving: null, error: null,
    timer: setInterval(() => { collector.advance(performance.now()); void save(entry).catch(() => {}); }, 1000) };
  active.add(entry); announceRecording('안구 기록 저장 중');
  return {
    sample: (at, value) => { if (active.has(entry)) collector.sample(at, value); },
    rest: completed => { if (active.has(entry)) collector.rest(performance.now(), completed); },
    finish: () => {
      if (!active.has(entry) || collector.record.status !== 'running') return;
      clearInterval(entry.timer); collector.finish(performance.now()); void save(entry).catch(() => {});
    },
  };
}
