import { emptyTotals, averageScore } from './contracts.ts';
import type { StatisticsRow } from './contracts.ts';

export function statisticsKey(row: Pick<StatisticsRow, 'mode' | 'scorePolicyVersion' | 'habitPolicyVersion'>) {
  return JSON.stringify([row.mode, row.scorePolicyVersion, row.habitPolicyVersion]);
}
export function summarizeStatistics(rows: StatisticsRow[]) {
  const groups = new Map<string, StatisticsRow>();
  for (const row of rows) {
    const key = statisticsKey(row);
    const group = groups.get(key) ?? { ...row, ...emptyTotals(), recordIds: [], sessionCount: 0, longestContinuousMs: 0 };
    for (const name of ['runMs', 'validMs', 'scoreTimeSum', 'deviationMs', 'deviationEpisodeCount'] as const) group[name] += row[name];
    group.longestContinuousMs = Math.max(group.longestContinuousMs, row.longestContinuousMs);
    group.recordIds = [...new Set([...group.recordIds, ...row.recordIds])];
    group.sessionCount = group.recordIds.length;
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({ ...group, average: averageScore(group),
    coverage: group.runMs > 0 ? Math.min(100, 100 * group.validMs / group.runMs) : null,
    unknownMs: Math.max(0, group.runMs - group.validMs),
    deviationRate: group.validMs > 0 ? 100 * group.deviationMs / group.validMs : null }));
}
export function scoreDifference(current: StatisticsRow | undefined, previous: StatisticsRow | undefined) {
  if (!current || !previous || statisticsKey(current) !== statisticsKey(previous)) return null;
  const a = averageScore(current), b = averageScore(previous);
  return a === null || b === null ? null : a - b;
}
