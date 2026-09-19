import { averageScore, localDateKey } from '../../../../database/contracts.ts';
import type { PostureRecord, RecordDetail } from '../../../../database/contracts.ts';
import { turtleRecordView } from './modes/turtle.ts';
import { shoulderRecordView } from './modes/shoulder.ts';
export function durationText(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? seconds + '초' : Math.floor(seconds / 60) + '분 ' + seconds % 60 + '초';
}
export function historyView(record: PostureRecord) {
  const mode = record.mode === 'turtle' ? turtleRecordView : shoulderRecordView;
  const local = new Date(record.startedAt - record.offsetMinutes * 60_000).toISOString();
  return { id: record.id, date: localDateKey(record.startedAt, record.offsetMinutes), mode: record.mode,
    title: mode.title, startedAt: local.slice(11, 19), duration: durationText(record.runMs), score: averageScore(record),
    warningCount: record.deviationEpisodeCount, status: record.status, policy: record.scorePolicyVersion,
    coverage: record.runMs ? 100 * record.validMs / record.runMs : null };
}
export type HistorySession = ReturnType<typeof historyView>;
export function historyGraph(detail: RecordDetail | null) {
  return detail?.buckets.map(bucket => ({ time: new Date(bucket.minute - detail.record.offsetMinutes * 60_000).toISOString().slice(0, 16).replace('T', ' '), score: averageScore(bucket) })) ?? [];
}
export function todayDateKey() { return localDateKey(Date.now(), new Date().getTimezoneOffset()); }
