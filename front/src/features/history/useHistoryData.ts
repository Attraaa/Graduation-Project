import { useCallback, useMemo } from 'react';
import type { HistoryRecord } from '../../../../database/eye';
import { getCurrentUser } from '../../utils/authStore';
import { LOGIN_REQUIRED, statusOf } from '../dashboard/useDashboardData';
import { recordsApi, recordValue } from '../records/api';
import { useRecordQuery } from '../records/useRecordQuery';
import type { RecordQueryLoader } from '../records/useRecordQuery';
import { datesBetween, entriesByDate, loadRange } from './calendar';
import type { CalendarView } from './calendar';

/** Loads every history page and the keyboard records of the shown period plus a week on each side. */
export function useHistoryData(view: CalendarView, date: string, today: string) {
  const owner = getCurrentUser()?.id ?? '';
  const { from, to } = loadRange(view, date, today);

  const loadHistory = useCallback<RecordQueryLoader<HistoryRecord[]>>(async ({ signal, publish }) => {
    if (!owner) throw new Error(LOGIN_REQUIRED);
    const records = new Map<string, HistoryRecord>();
    let offset = 0;
    for (;;) {
      signal.throwIfAborted();
      const page = await recordValue(recordsApi().history({ owner, from, to, offset }));
      for (const record of page.records) records.set(`${record.mode}:${record.id}`, record);
      const received = [...records.values()];
      if (!page.hasMore) return received;
      if (!page.records.length) throw new Error('남은 학습이력을 불러오지 못했어요');
      offset += page.records.length;
      publish(received);
    }
  }, [owner, from, to]);
  const loadKeyboard = useCallback(async () => {
    if (!owner) throw new Error(LOGIN_REQUIRED);
    return recordValue(recordsApi().keyboardStatistics({ owner, from, to }));
  }, [owner, from, to]);

  const key = `${owner}:${from}:${to}`;
  const history = useRecordQuery('history-records:' + key, loadHistory);
  const keyboard = useRecordQuery('history-keyboard:' + key, loadKeyboard);
  const byDate = useMemo(() => entriesByDate(history.data ?? [], keyboard.data ?? [], datesBetween(from, to)),
    [history.data, keyboard.data, from, to]);
  return {
    byDate,
    hasLoadedCameraRecords: history.data?.some(record => record.mode !== 'keyboard') ?? false,
    status: { history: statusOf(history), keyboard: statusOf(keyboard) },
    retryHistory: history.retry,
    retryKeyboard: keyboard.retry,
  };
}
