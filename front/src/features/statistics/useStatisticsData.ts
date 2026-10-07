import { useCallback, useMemo } from 'react';
import { getCurrentUser } from '../../utils/authStore';
import { LOGIN_REQUIRED, statusOf } from '../dashboard/useDashboardData';
import { recordsApi, recordValue } from '../records/api';
import { useRecordQuery } from '../records/useRecordQuery';
import { buildStatistics, statisticsRange } from './period';
import type { PeriodDays } from './period';

/** Loads the three sources for both periods at once; tabs never reload. period.ts does all calculation. */
export function useStatisticsData(end: string, days: PeriodDays) {
  const owner = getCurrentUser()?.id ?? '';
  const { from, to } = statisticsRange(end, days);

  const loadPosture = useCallback(async () => {
    if (!owner) throw new Error(LOGIN_REQUIRED);
    return recordValue(recordsApi().statistics({ owner, from, to }));
  }, [owner, from, to]);
  const loadEye = useCallback(async () => {
    if (!owner) throw new Error(LOGIN_REQUIRED);
    return recordValue(recordsApi().eyeStatistics({ owner, from, to }));
  }, [owner, from, to]);
  const loadKeyboard = useCallback(async () => {
    if (!owner) throw new Error(LOGIN_REQUIRED);
    return recordValue(recordsApi().keyboardStatistics({ owner, from, to }));
  }, [owner, from, to]);

  const key = `${owner}:${from}:${to}`;
  const posture = useRecordQuery('statistics-posture:' + key, loadPosture);
  const eye = useRecordQuery('statistics-eye:' + key, loadEye);
  const keyboard = useRecordQuery('statistics-keyboard:' + key, loadKeyboard);

  const summary = useMemo(
    () => buildStatistics({ end, days, posture: posture.data, eye: eye.data, keyboard: keyboard.data }),
    [end, days, posture.data, eye.data, keyboard.data],
  );
  return {
    summary,
    keyboard: keyboard.data ?? [],
    status: { posture: statusOf(posture), eye: statusOf(eye), keyboard: statusOf(keyboard) },
    retry: () => { posture.retry(); eye.retry(); keyboard.retry(); },
  };
}
