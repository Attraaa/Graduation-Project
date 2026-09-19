import { CaptureRecorder } from '../../../../database/recorder';
import type { CaptureEvaluation } from '../../../../database/recorder';
import { emptyTotals } from '../../../../database/contracts';
import type { RecordMode } from '../../../../database/contracts';
import { getCurrentUser } from '../../utils/authStore';
import { recordsApi, recordValue } from './api';

export interface CaptureStart { mode: RecordMode; scorePolicyVersion: string; habitPolicyVersion: string; at: number; epoch: number }
export interface CaptureSink { sample(at: number, evaluation: CaptureEvaluation): void; finish(at: number): void }
type Active = { collector: CaptureRecorder; generation: Promise<number>; saving: Promise<void> | null; timer: ReturnType<typeof setInterval>; stopped: boolean; error: string | null };
const active = new Set<Active>();
const listeners = new Set<() => void>();
let message = '측정한 기록은 이 PC에 저장됩니다.';
const announce = (next: string) => {
  const failed = [...active].find(entry => entry.error);
  const value = failed ? `저장 실패: ${failed.error} 앱을 닫기 전에 저장을 재시도해 주세요.` : next;
  if (value === message) return;
  message = value; listeners.forEach(listener => listener());
};
export const subscribeRecording = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const recordingMessage = () => message;

async function save(entry: Active) {
  if (entry.saving) return entry.saving;
  entry.saving = (async () => {
    try {
      const generation = await entry.generation;
      if (!active.has(entry)) return;
      do {
        const batch = entry.collector.batch(generation);
        if (!batch) break;
        await recordValue(recordsApi().write(batch));
        entry.collector.acknowledge();
        if (batch.record.status !== 'running') { active.delete(entry); break; }
      } while (entry.stopped || entry.collector.hasPending);
      entry.error = null;
      announce('측정 기록이 이 PC에 저장되었습니다.');
    } catch (error) {
      if (!active.has(entry)) return;
      entry.error = error instanceof Error ? error.message : String(error);
      entry.generation = recordValue(recordsApi().generation(entry.collector.record.owner));
      void entry.generation.catch(() => {});
      announce(`저장 실패: ${error instanceof Error ? error.message : String(error)} 앱을 닫기 전에 저장을 재시도해 주세요.`);
      throw error;
    } finally { entry.saving = null; }
  })();
  return entry.saving;
}

export function beginPostureRecording(start: CaptureStart): CaptureSink {
  const owner = getCurrentUser()?.id;
  const noop = { sample: () => {}, finish: () => {} };
  if (!owner) { announce('로그인하면 측정 기록을 저장할 수 있습니다. 현재 측정은 저장되지 않습니다.'); return noop; }
  try { recordsApi(); } catch (error) { announce((error as Error).message); return noop; }
  const collector = new CaptureRecorder({ ...emptyTotals(), id: crypto.randomUUID(), owner, mode: start.mode,
    startedAt: start.epoch, updatedAt: start.epoch, offsetMinutes: new Date(start.epoch).getTimezoneOffset(),
    scorePolicyVersion: start.scorePolicyVersion, habitPolicyVersion: start.habitPolicyVersion, longestContinuousMs: 0, status: 'running' }, start.at);
  const generation = recordValue(recordsApi().generation(owner));
  // Attach a handler immediately; save retains the rejection for the visible retry path.
  void generation.catch(() => {});
  const entry: Active = { collector, generation, saving: null, stopped: false, error: null, timer: setInterval(() => {
    collector.advance(performance.now()); void save(entry).catch(() => {});
  }, 1000) };
  active.add(entry);
  const finish = (at: number) => {
    if (entry.stopped) return;
    clearInterval(entry.timer); entry.stopped = true; collector.finish(at);
    void save(entry).catch(() => {});
  };
  announce('측정 기록 저장 중');
  return { sample: (at, evaluation) => collector.sample(at, evaluation), finish };
}

export async function retryRecordings() {
  await Promise.all([...active].map(entry => save(entry)));
}
export async function finishRecordings() {
  for (const entry of active) {
    clearInterval(entry.timer); entry.stopped = true; entry.collector.finish(performance.now());
  }
  await retryRecordings();
}
export function discardDeletedRecordings(owner: string) {
  for (const entry of active) if (entry.collector.record.owner === owner) {
    clearInterval(entry.timer); entry.stopped = true; entry.collector.finish(performance.now()); active.delete(entry);
  }
  announce('현재 계정 기록을 삭제했습니다. 새 측정부터 다시 저장됩니다.');
}

if (typeof window !== 'undefined') window.motiRecords?.onClosing(async () => {
  window.dispatchEvent(new Event('moti-stop-measurement'));
  try { await finishRecordings(); return true; } catch { return false; }
});
