import { useCallback } from 'react';
import type { RecordDetail } from '../../../../database/contracts';
import type { EyeDetail } from '../../../../database/eye';
import type { KeyboardStored } from '../../../../database/keyboard';
import { getCurrentUser } from '../../utils/authStore';
import { recordsApi, recordValue } from '../records/api';
import { useRecordQuery } from '../records/useRecordQuery';
import type { HistoryEntry } from './calendar';

export type LoadedDetail =
  | { mode: 'upper'; details: RecordDetail[] }
  | { mode: 'eye'; detail: EyeDetail }
  | { mode: 'keyboard'; stored: KeyboardStored };

/** Loads the selected row's detail: both upper records, one eye record or one keyboard session. */
export function useRecordDetail(entry: HistoryEntry | null) {
  const owner = getCurrentUser()?.id ?? '';
  const load = useCallback(async (): Promise<LoadedDetail | null> => {
    if (!entry) return null;
    const source = entry.source;
    if (source.mode === 'upper') {
      return { mode: 'upper', details: await Promise.all(source.records.map(record => recordValue(recordsApi().detail(owner, record.id)))) };
    }
    if (source.mode === 'eye') return { mode: 'eye', detail: await recordValue(recordsApi().eyeDetail(owner, source.record.id)) };
    return { mode: 'keyboard', stored: await recordValue(recordsApi().keyboardDetail(owner, source.stored.record.id)) };
  }, [owner, entry]);
  return useRecordQuery(`history-detail:${owner}:${entry ? `${entry.mode}:${entry.id}` : ''}`, load);
}
