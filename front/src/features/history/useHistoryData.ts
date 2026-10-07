import { useCallback, useMemo } from 'react';
import type { PostureRecord } from '../../../../database/contracts';
import type { EyeRecord } from '../../../../database/eye';
import { getCurrentUser } from '../../utils/authStore';
import { LOGIN_REQUIRED, statusOf } from '../dashboard/useDashboardData';
import { recordsApi, recordValue } from '../records/api';
import { useRecordQuery } from '../records/useRecordQuery';
import { datesBetween, entriesByDate, loadRange } from './calendar';
import type { CalendarView } from './calendar';

/** Loads every history page and the keyboard records of the shown period plus a week on each side. */
export function useHistoryData(view: CalendarView, date: string, today: string) {
  const owner = getCurrentUser()?.id ?? '';
  const { from, to } = loadRange(view, date, today);

  const loadHistory = useCallback(async () => {
    if (!owner) throw new Error(LOGIN_REQUIRED);
    const records: (PostureRecord | EyeRecord)[] = [];
    for (;;) {
      const page = await recordValue(recordsApi().history({ owner, from, to, offset: records.length }));
      records.push(...page.records);
      if (!page.hasMore || !page.records.length) return records;
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
    status: { history: statusOf(history), keyboard: statusOf(keyboard) },
    retry: () => { history.retry(); keyboard.retry(); },
    retryKeyboard: keyboard.retry,
  };
}
