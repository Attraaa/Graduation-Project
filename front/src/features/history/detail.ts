import { averageScore } from '../../../../database/contracts.ts';
import type { PostureRecord, RecordDetail } from '../../../../database/contracts.ts';
import { eyeRate } from '../../../../database/eye.ts';
import type { EyeDetail } from '../../../../database/eye.ts';
import { keyboardSummary } from '../../../../database/keyboard.ts';
import { clockText, minutesText } from '../dashboard/format.ts';
import type { HistoryEntry } from './calendar.ts';

/** One minute of a 상체 row: neck and balance scores and, from the same camera, the blink rate. */
export type MinuteRow = { minute: number; time: string; turtle: number | null; balance: number | null; rate: number | null };
export type EyeMinuteRow = { minute: number; time: string; rate: number | null };
/** One number at the top of the detail panel; a null value shows as "—". */
export interface DetailStat { label: string; value: string | null; unit?: string }
/** A row of numbers in the detail panel: 자세 and 눈 for a 상체 row (2026-11-28), one unnamed row for keyboard. */
export interface DetailGroup { name: '자세' | '눈' | null; stats: DetailStat[] }

/** Blink rate per minute of one eye session; a minute with under 30 s of valid observation has no rate. */
export function eyeMinutes(detail: EyeDetail): EyeMinuteRow[] {
  return detail.buckets
    .map(bucket => ({ minute: bucket.minute, time: clockText(bucket.minute, detail.record.offsetMinutes), rate: eyeRate(bucket) }))
    .sort((a, b) => a.minute - b.minute);
}

/**
 * Neck and balance scores per minute of one 상체 row (every reference segment of the run) and the blink rate of the same
 * minute from the run's eye record. Minutes without valid time stay empty.
 */
export function upperMinutes(details: RecordDetail[], eye: EyeDetail | null = null): MinuteRow[] {
  const rows = new Map<number, MinuteRow>();
  const row = (minute: number, offsetMinutes: number) => {
    const found = rows.get(minute) ?? { minute, time: clockText(minute, offsetMinutes), turtle: null, balance: null, rate: null };
    rows.set(minute, found);
    return found;
  };
  for (const detail of details) {
    for (const bucket of detail.buckets) {
      const minute = row(bucket.minute, detail.record.offsetMinutes);
      // Segments of one run do not overlap; a shared minute keeps the value of the later segment.
      minute[detail.record.mode] = averageScore(bucket) ?? minute[detail.record.mode];
    }
  }
  if (eye) for (const bucket of eyeMinutes(eye)) row(bucket.minute, eye.record.offsetMinutes).rate = bucket.rate;
  return [...rows.values()].sort((a, b) => a.minute - b.minute);
}

/** Tile values of one upper session: deviations of both records and the valid share of both run times. */
export function upperTotals(records: PostureRecord[]) {
  const sum = (pick: (record: PostureRecord) => number) => records.reduce((value, record) => value + pick(record), 0);
  const run = sum(record => record.runMs);
  return { deviations: sum(record => record.deviationEpisodeCount), validRate: run > 0 ? (100 * sum(record => record.validMs)) / run : null };
}

const whole = (value: number | null) => (value === null ? null : String(Math.round(value)));

/**
 * The whole numbers shown above the chart, read from the history row itself (no detail request needed). A 상체 row
 * shows 자세 and 눈 as two named rows; a part the run has no record for is left out.
 */
export function detailStats(entry: HistoryEntry): DetailGroup[] {
  const source = entry.source;
  if (source.mode === 'upper') {
    const groups: DetailGroup[] = [];
    if (source.records.length) {
      const totals = upperTotals(source.records);
      groups.push({ name: '자세', stats: [
        { label: '목', value: whole(entry.turtle), unit: '점' },
        { label: '좌우 균형', value: whole(entry.balance), unit: '점' },
        { label: '기준에서 벗어남', value: String(totals.deviations), unit: '회' },
        { label: '제대로 측정', value: whole(totals.validRate), unit: '%' },
      ] });
    }
    if (source.eye) {
      const record = source.eye;
      groups.push({ name: '눈', stats: [
        { label: '깜빡임 빈도', value: whole(eyeRate(record)), unit: '회/분' },
        { label: '깜빡임', value: record.blinks.toLocaleString('ko-KR'), unit: '회' },
        { label: '깜빡임 안내', value: String(record.openReminders), unit: '회' },
        { label: '유효 관찰', value: minutesText(record.validMs) },
      ] });
    }
    return groups;
  }
  const summary = keyboardSummary(source.stored.counts, source.stored.record.nearbyCredit);
  return [{ name: null, stats: [
    { label: '훈련 점수', value: whole(summary.score), unit: '점' },
    { label: '판정한 입력', value: String(summary.valid), unit: '회' },
    { label: '판정 가능 비율', value: whole(summary.coverage), unit: '%' },
  ] }];
}

/** The second line of a record in the day list: the row's main numbers (2026-11-28, 시안 H01). */
export function entrySummary(entry: HistoryEntry): string {
  if (entry.mode === 'keyboard') {
    return [entry.score === null ? '판정 자료 없음' : `훈련 점수 ${whole(entry.score)}`,
      entry.coverage === null ? null : `판정 가능 ${whole(entry.coverage)}%`].filter(Boolean).join(' · ');
  }
  const parts = entry.source.mode === 'upper' && entry.source.records.length
    ? [`목 ${whole(entry.turtle) ?? '—'}`, `균형 ${whole(entry.balance) ?? '—'}`] : [];
  if (entry.source.mode === 'upper' && entry.source.eye) parts.push(`깜빡임 ${entry.rate === null ? '—' : `${whole(entry.rate)}회/분`}`);
  return parts.join(' · ');
}
