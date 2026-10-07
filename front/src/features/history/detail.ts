import { averageScore } from '../../../../database/contracts.ts';
import type { PostureRecord, RecordDetail } from '../../../../database/contracts.ts';
import { clockText } from '../dashboard/format.ts';

export type MinuteRow = { minute: number; time: string; turtle: number | null; shoulder: number | null };

/** Neck and shoulder scores per minute of one upper session; minutes without valid time stay empty. */
export function upperMinutes(details: RecordDetail[]): MinuteRow[] {
  const rows = new Map<number, MinuteRow>();
  for (const detail of details) {
    for (const bucket of detail.buckets) {
      const row = rows.get(bucket.minute)
        ?? { minute: bucket.minute, time: clockText(bucket.minute, detail.record.offsetMinutes), turtle: null, shoulder: null };
      row[detail.record.mode] = averageScore(bucket);
      rows.set(bucket.minute, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.minute - b.minute);
}

/** Tile values of one upper session: deviations of both records and the valid share of both run times. */
export function upperTotals(records: PostureRecord[]) {
  const sum = (pick: (record: PostureRecord) => number) => records.reduce((value, record) => value + pick(record), 0);
  const run = sum(record => record.runMs);
  return { deviations: sum(record => record.deviationEpisodeCount), validRate: run > 0 ? (100 * sum(record => record.validMs)) / run : null };
}
