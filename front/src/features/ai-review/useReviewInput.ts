import { useCallback, useSyncExternalStore } from 'react';
import { latestPolicyGroups } from '../dashboard/summary';
import { getCurrentUser } from '../../utils/authStore';
import { readBrowserPostureSummaries } from '../records/postureTimelineBrowser';
import { localReviewRevision, subscribeLocalReview } from '../records/reviewRefresh';
import { readLocalReviewResults } from '../records/localReviewResults';
import { localPostureDaily, localPostureReview } from '../records/reviewSession';
import { useRecordQuery } from '../records/useRecordQuery';
import { buildStatistics, statisticsRange, type PeriodDays } from '../statistics/period';
import { useStatisticsData } from '../statistics/useStatisticsData';
import { aiReviewInput, type AiReviewInput, type DailyScores } from './input';

export function useReviewInput(today: string, days: PeriodDays) {
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
    // Daily values come from this device too: posture from the session summaries, keyboard and eye from the saved results.
    const posture = localPostureDaily(sessions, midnight(since).getTime(), summary.range.dates);
    const tenth = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);
    const daily: DailyScores = summary.days.map((day, i) => ({ date: day.date, neck: posture[i].neck, side: posture[i].side, keyboard: tenth(day.keyboard.score) }));
    const measuredDays = summary.days.filter((day, i) => day.hasRecords || posture[i].neck !== null || posture[i].side !== null).length;
    return { posture: localPostureReview(sessions, midnight(since).getTime()), eye: input?.eye, keyboard: input?.keyboard, daily, measuredDays };
  }, [owner, from, since, to, days]);
  const saved = useSyncExternalStore(subscribeLocalReview, localReviewRevision, localReviewRevision);
  const local = useRecordQuery(`local-review:${owner}:${from}:${to}:${saved}`, load);
  const legacy = aiReviewInput(cloud.summary, cloud.keyboard, days);
  const data = local.data;
  // With device posture summaries the daily values are this device's; otherwise they are the server statistics'.
  const fromDevice = !!data?.posture || !legacy;
  const input: AiReviewInput = { days, measuredDays: (fromDevice ? data?.measuredDays : legacy?.measuredDays) ?? 0,
    daily: (fromDevice ? data?.daily : legacy?.daily) ?? [], upper: data?.posture ? null : legacy?.upper ?? null,
    ...(data?.posture ? { localPosture: data.posture } : {}),
    eye: data?.eye ?? legacy?.eye ?? null, keyboard: data?.keyboard ?? legacy?.keyboard ?? null };
  const hasInput = !!(input.localPosture || input.upper || input.eye || input.keyboard);
  const sources = Object.values(cloud.status);
  const loading = local.loading || sources.includes('loading');
  const failed = !!local.error || !hasInput && sources.includes('error');
  return { owner, input: loading || failed || !hasInput ? null : input, loading, failed, retry: () => { local.retry(); cloud.retry(); } };
}
