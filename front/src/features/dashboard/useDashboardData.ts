import { useCallback, useMemo } from 'react';
import type { HistoryRecord } from '../../../../database/eye';
import { getCurrentUser } from '../../utils/authStore';
import { recordsApi, recordValue } from '../records/api';
import { useRecordQuery } from '../records/useRecordQuery';
import { todayDateKey } from '../records/views';
import type { SourceStatus } from './SourceState';
import { buildDashboard, dashboardDates } from './summary';

export const LOGIN_REQUIRED = '로그인하면 이 계정의 기록을 볼 수 있어요.';
export const statusOf = (query: { loading: boolean; error: string | null }): SourceStatus =>
  query.loading ? 'loading' : query.error ? 'error' : 'ready';

/** Loads the four dashboard sources in parallel; summary.ts does all calculation. */
export function useDashboardData() {
  const owner = getCurrentUser()?.id ?? '';
  const today = todayDateKey();
  const from = dashboardDates(today)[0];

  const loadPosture = useCallback(async () => {
    if (!owner) throw new Error(LOGIN_REQUIRED);
    return recordValue(recordsApi().statistics({ owner, from, to: today }));
  }, [owner, from, today]);
  const loadEye = useCallback(async () => {
    if (!owner) throw new Error(LOGIN_REQUIRED);
    return recordValue(recordsApi().eyeStatistics({ owner, from, to: today }));
  }, [owner, from, today]);
  const loadKeyboard = useCallback(async () => {
    if (!owner) throw new Error(LOGIN_REQUIRED);
    return recordValue(recordsApi().keyboardStatistics({ owner, from, to: today }));
  }, [owner, from, today]);
  const loadHistory = useCallback(async () => {
    if (!owner) throw new Error(LOGIN_REQUIRED);
    const records: HistoryRecord[] = [];
    for (;;) {
      const page = await recordValue(recordsApi().history({ owner, from: today, to: today, offset: records.length }));
      records.push(...page.records);
      if (!page.hasMore || !page.records.length) return records;
    }
  }, [owner, today]);

  const key = `${owner}:${today}`;
  const posture = useRecordQuery('dashboard-posture:' + key, loadPosture);
  const eye = useRecordQuery('dashboard-eye:' + key, loadEye);
  const keyboard = useRecordQuery('dashboard-keyboard:' + key, loadKeyboard);
  const history = useRecordQuery('dashboard-history:' + key, loadHistory);

  const summary = useMemo(
    () => buildDashboard({ today, posture: posture.data, eye: eye.data, keyboard: keyboard.data, history: history.data }),
    [today, posture.data, eye.data, keyboard.data, history.data],
  );
  return {
    today,
    summary,
    status: { posture: statusOf(posture), eye: statusOf(eye), keyboard: statusOf(keyboard), history: statusOf(history) },
    retry: () => { posture.retry(); eye.retry(); keyboard.retry(); history.retry(); },
  };
}
