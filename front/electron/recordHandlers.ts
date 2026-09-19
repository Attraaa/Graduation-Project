import type { RecordRepository } from '../../database/sqlite/repository.ts';
import type { RecordsResult } from '../../database/contracts.ts';

export function trustedRecordUrl(actual: string, expected: string) {
  try {
    const a = new URL(actual), b = new URL(expected);
    a.hash = ''; b.hash = '';
    return a.href === b.href;
  } catch { return false; }
}

/** Sender checks run before input parsing or database access. */
export function recordCall<T>(trusted: boolean, operation: () => T): RecordsResult<T> {
  if (!trusted) return { ok: false, error: '허용되지 않은 기록 요청입니다.' };
  try { return { ok: true, value: operation() }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : '기록 처리에 실패했습니다.' }; }
}
export function requireRecords(repository: RecordRepository | null, error: string) {
  if (!repository) throw new Error(error || '로컬 기록 저장소를 사용할 수 없습니다.');
  return repository;
}
