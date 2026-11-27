import { useCallback, useSyncExternalStore } from 'react';
import { latestPolicyGroups } from '../dashboard/summary';
import { getCurrentUser } from '../../utils/authStore';
import { readBrowserPostureSummaries } from '../records/postureTimelineBrowser';
import { localReviewRevision, subscribeLocalReview } from '../records/reviewRefresh';
import { readLocalReviewResults } from '../records/localReviewResults';
import { localPostureReview } from '../records/reviewSession';
import { useRecordQuery } from '../records/useRecordQuery';
import { buildStatistics, statisticsRange } from '../statistics/period';
import { useStatisticsData } from '../statistics/useStatisticsData';
import { aiReviewInput, type AiReviewDays, type AiReviewInput } from './input';

export function useReviewInput(today: string, days: AiReviewDays) {
  const owner = getCurrentUser()?.id ?? '';
  const cloud = useStatisticsData(today, days);
  const { from, to, dates } = statisticsRange(today, days);
  const since = dates[0];
  const load = useCallback(async () => {
    if (!owner) throw new Error('로그인이 필요합니다.');
    const midnight = (date: string) => new Date(date + 'T00:00:00');
    const until = midnight(to);
    until.setDate(until.getDate() + 1);
    const read = window.motiRecords?.readPostureSummaries ?? readBrowserPostureSummaries;
    const [sessions, aux] = await Promise.all([
      read(owner, midnight(from).getTime(), until.getTime()), readLocalReviewResults(owner, from, to),
    ]);
    const summary = buildStatistics({ end: to, days, posture: null, eye: aux.eye, keyboard: aux.keyboard });
    const group = latestPolicyGroups({ posture: null, eye: null, keyboard: aux.keyboard });
    const input = aiReviewInput(summary, group.keyboard, days);
    return { posture: localPostureReview(sessions, midnight(since).getTime()), eye: input?.eye, keyboard: input?.keyboard };
  }, [owner, from, since, to, days]);
  const saved = useSyncExternalStore(subscribeLocalReview, localReviewRevision, localReviewRevision);
  const local = useRecordQuery(`local-review:${owner}:${from}:${to}:${saved}`, load);
  const legacy = aiReviewInput(cloud.summary, cloud.keyboard, days);
  const data = local.data;
  const input: AiReviewInput = { days, upper: data?.posture ? null : legacy?.upper ?? null,
    ...(data?.posture ? { localPosture: data.posture } : {}),
    eye: data?.eye ?? legacy?.eye ?? null, keyboard: data?.keyboard ?? legacy?.keyboard ?? null };
  const hasInput = !!(input.localPosture || input.upper || input.eye || input.keyboard);
  const sources = Object.values(cloud.status);
  const loading = local.loading || sources.includes('loading');
  const failed = !!local.error || !hasInput && sources.includes('error');
  return { owner, input: loading || failed || !hasInput ? null : input, loading, failed, retry: () => { local.retry(); cloud.retry(); } };
}
