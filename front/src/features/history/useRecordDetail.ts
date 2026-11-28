import { useCallback } from 'react';
import type { RecordDetail } from '../../../../database/contracts';
import type { EyeDetail } from '../../../../database/eye';
import type { KeyboardStored } from '../../../../database/keyboard';
import { getCurrentUser } from '../../utils/authStore';
import { recordsApi, recordValue } from '../records/api';
import { useRecordQuery } from '../records/useRecordQuery';
import type { HistoryEntry } from './calendar';

export type LoadedDetail =
  | { mode: 'upper'; details: RecordDetail[]; eye: EyeDetail | null }
  | { mode: 'keyboard'; stored: KeyboardStored };

/** Loads the selected row's detail: a 상체 run's posture records with its eye record, or one keyboard session. */
export function useRecordDetail(entry: HistoryEntry | null) {
  const owner = getCurrentUser()?.id ?? '';
  const load = useCallback(async (): Promise<LoadedDetail | null> => {
    if (!entry) return null;
    const source = entry.source;
    if (source.mode === 'upper') {
      const [details, eye] = await Promise.all([
        Promise.all(source.records.map(record => recordValue(recordsApi().detail(owner, record.id)))),
        source.eye ? recordValue(recordsApi().eyeDetail(owner, source.eye.id)) : Promise.resolve(null),
      ]);
      return { mode: 'upper', details, eye };
    }
    return { mode: 'keyboard', stored: await recordValue(recordsApi().keyboardDetail(owner, source.stored.record.id)) };
  }, [owner, entry]);
  return useRecordQuery(`history-detail:${owner}:${entry ? `${entry.mode}:${entry.id}` : ''}`, load);
}
