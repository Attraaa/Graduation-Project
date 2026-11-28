import { useCallback, useSyncExternalStore } from 'react';
import type { KeyboardStored } from '../../../../database/keyboard.ts';
import { getCurrentUser } from '../../utils/authStore';
import { shiftDate } from '../dashboard/summary';
import { recordsApi, recordValue } from '../records/api';
import { loadDailyPosture } from '../records/dailyPostureReview';
import { readLocalReviewResults } from '../records/localReviewResults';
import { localReviewRevision, subscribeLocalReview } from '../records/reviewRefresh';
import { useRecordQuery } from '../records/useRecordQuery';
import { loadDailyEye } from './dailyEye';
import { buildDailyReviewInput } from './input';

function mergeKeyboardSessions(server: KeyboardStored[], local: KeyboardStored[]) {
  const sessions = new Map(server.map(session => [session.record.id, session]));
  for (const session of local) {
    const current = sessions.get(session.record.id)?.record;
    if (!current || session.record.updatedAt > current.updatedAt ||
      (session.record.updatedAt === current.updatedAt && session.record.total >= current.total)) {
      sessions.set(session.record.id, session);
    }
  }
  return [...sessions.values()];
}

export function useReviewInput(date: string) {
  const owner = getCurrentUser()?.id ?? '';
  const saved = useSyncExternalStore(subscribeLocalReview, localReviewRevision, localReviewRevision);
  const load = useCallback(async ({ signal }: { signal: AbortSignal }) => {
    if (!owner) throw new Error('로그인이 필요합니다.');
    const query = { owner, from: date, to: date };
    // A completed snapshot is filed by its end date, including sessions ending after midnight.
    const device = readLocalReviewResults(owner, date, date, shiftDate(date, 1)).catch(() => null);
    const readKeyboard = () => recordValue(recordsApi().keyboardStatistics(query)).catch(async error => {
      if ((await device)?.keyboard.length) return [];
      throw error;
    });
    const [posture, eye, serverKeyboard, local] = await Promise.all([
      loadDailyPosture(owner, date, signal),
      device.then(snapshots => loadDailyEye(owner, date, snapshots?.eye ?? [], signal)),
      readKeyboard(),
      device,
    ]);
    signal.throwIfAborted();
    const keyboard = mergeKeyboardSessions(serverKeyboard, local?.keyboard ?? []);
    return buildDailyReviewInput(date, posture, eye, keyboard);
  }, [owner, date]);
  const review = useRecordQuery(`daily-review:${owner}:${date}:${saved}`, load);
  return { owner, input: review.data, loading: review.loading, failed: !!review.error, retry: review.retry };
}
