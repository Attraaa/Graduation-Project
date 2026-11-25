import { averageScore } from '../../../../database/contracts.ts';
import type { PostureRecord, RecordDetail } from '../../../../database/contracts.ts';
import { eyeRate } from '../../../../database/eye.ts';
import type { EyeDetail } from '../../../../database/eye.ts';
import { keyboardSummary } from '../../../../database/keyboard.ts';
import { clockText, minutesText } from '../dashboard/format.ts';
import type { HistoryEntry } from './calendar.ts';

export type MinuteRow = { minute: number; time: string; turtle: number | null; balance: number | null };
export type EyeMinuteRow = { minute: number; time: string; rate: number | null };
/** One number at the top of the detail panel; a null value shows as "—". */
export interface DetailStat { label: string; value: string | null; unit?: string }

/** Neck and balance scores per minute of one upper session; minutes without valid time stay empty. */
export function upperMinutes(details: RecordDetail[]): MinuteRow[] {
  const rows = new Map<number, MinuteRow>();
  for (const detail of details) {
    for (const bucket of detail.buckets) {
      const row = rows.get(bucket.minute)
        ?? { minute: bucket.minute, time: clockText(bucket.minute, detail.record.offsetMinutes), turtle: null, balance: null };
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

/** Blink rate per minute of one eye session; a minute with under 30 s of valid observation has no rate. */
export function eyeMinutes(detail: EyeDetail): EyeMinuteRow[] {
  return detail.buckets
    .map(bucket => ({ minute: bucket.minute, time: clockText(bucket.minute, detail.record.offsetMinutes), rate: eyeRate(bucket) }))
    .sort((a, b) => a.minute - b.minute);
}

const whole = (value: number | null) => (value === null ? null : String(Math.round(value)));

/** The few whole numbers shown above the chart, read from the history row itself (no detail request needed). */
export function detailStats(entry: HistoryEntry): DetailStat[] {
  const source = entry.source;
  if (source.mode === 'upper') {
    const totals = upperTotals(source.records);
    return [
      { label: '목', value: whole(entry.turtle), unit: '점' },
      { label: '좌우 균형', value: whole(entry.balance), unit: '점' },
      { label: '기준에서 벗어남', value: String(totals.deviations), unit: '회' },
      { label: '제대로 측정', value: whole(totals.validRate), unit: '%' },
    ];
  }
  if (source.mode === 'eye') {
    const record = source.record;
    return [
      { label: '깜빡임 빈도', value: whole(eyeRate(record)), unit: '회/분' },
      { label: '깜빡임', value: String(record.blinks), unit: '회' },
      { label: '유효 관찰 시간', value: minutesText(record.validMs) },
      { label: '눈 휴식 완료', value: String(record.breaks), unit: '회' },
    ];
  }
  const summary = keyboardSummary(source.stored.counts, source.stored.record.nearbyCredit);
  return [
    { label: '훈련 점수', value: whole(summary.score), unit: '점' },
    { label: '판정한 입력', value: String(summary.valid), unit: '회' },
    { label: '판정 가능 비율', value: whole(summary.coverage), unit: '%' },
  ];
}
