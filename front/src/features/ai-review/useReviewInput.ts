import { useCallback, useSyncExternalStore } from 'react';
import type { KeyboardStored } from '../../../../database/keyboard.ts';
import { MAX_REVIEW_DAYS, type DailyReviewInput, type ReviewRequest } from '../../../../database/localReview.ts';
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

export function useReviewInput(from: string, to = from) {
  const owner = getCurrentUser()?.id ?? '';
  const saved = useSyncExternalStore(subscribeLocalReview, localReviewRevision, localReviewRevision);
  const load = useCallback(async ({ signal }: { signal: AbortSignal }) => {
    if (!owner) throw new Error('로그인이 필요합니다.');
    const query = { owner, from, to };
    const dates: string[] = [];
    for (let date = from; date <= to; date = shiftDate(date, 1)) {
      dates.push(date);
      if (dates.length > MAX_REVIEW_DAYS) throw new Error('총평 기간은 최대 7일까지 선택할 수 있어요.');
    }
    // A completed snapshot is filed by its end date, including sessions ending after midnight.
    const device = readLocalReviewResults(owner, from, to, shiftDate(to, 1)).catch(() => null);
    const readKeyboard = () => recordValue(recordsApi().keyboardStatistics(query)).catch(async error => {
      if ((await device)?.keyboard.length) return [];
      throw error;
    });
    const [serverKeyboard, local] = await Promise.all([readKeyboard(), device]);
    signal.throwIfAborted();
    const keyboard = mergeKeyboardSessions(serverKeyboard, local?.keyboard ?? []);
    const days: DailyReviewInput[] = [];
    const loadDay = async (date: string) => {
      const localEye = (local?.eye ?? []).filter(session => session.rows.some(row => row.date === date));
      const [posture, eye] = await Promise.all([
        loadDailyPosture(owner, date, signal),
        loadDailyEye(owner, date, localEye, signal),
      ]);
      return buildDailyReviewInput(date, posture, eye, keyboard);
    };
    for (let index = 0; index < dates.length; index += 2) {
      signal.throwIfAborted();
      const batch = await Promise.all(dates.slice(index, index + 2).map(loadDay));
      for (const day of batch) if (day) days.push(day);
    }
    return days;
  }, [owner, from, to]);
  const review = useRecordQuery(`review:${owner}:${from}:${to}:${saved}`, load);
  const days = review.data ?? [];
  // Each day's mean and exact late change already include its whole timeline. The range does not need every five-minute bucket.
  const input: ReviewRequest | null = !days.length ? null : from === to ? days[0] : { from, to,
    days: days.map(day => ({ ...day, posture: day.posture && { ...day.posture,
      scores: day.posture.scores.map(score => ({ ...score, periods: [] })),
    } })),
  };
  return { owner, input, days, loading: review.loading, failed: !!review.error, retry: review.retry };
}
