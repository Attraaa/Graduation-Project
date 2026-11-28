import type { LocalPostureReview } from '../../../../database/localReview.ts';
import { keyboardSummary } from '../../../../database/keyboard.ts';
import type { KeyboardCount, KeyboardStored } from '../../../../database/keyboard.ts';
import { minutesText, monthDayText, rateText } from '../dashboard/format.ts';
import { keyLabel } from '../keyboard/keyExploration.ts';
import type { PeriodDays, StatisticsSummary } from '../statistics/period.ts';
import { percentLabel } from '../statistics/text.ts';

type Pair = { current: number | null; previous: number | null };
export type DailyScores = { date: string; neck: number | null; side: number | null; keyboard: number | null }[];
/** Body of POST /api/ai/review (server/src/services/aiReview.ts): numbers, dates, hours and key codes only. */
export interface AiReviewInput {
  days: PeriodDays;
  measuredDays: number;
  /** One entry per date of the period, oldest first. side is 좌우 균형 (어깨 for older device records). */
  daily: DailyScores;
  localPosture?: LocalPostureReview;
  upper: {
    neck: Pair; balance: Pair; measuredMinutes: number; sessions: number;
    deviations: number; deviationRate: number | null; validRate: number | null;
    longestMinutes: number;
    hourly: { hour: number; neck: number | null; balance: number | null }[];
    deviationHours: { hour: number; count: number; minutes: number }[];
  } | null;
  eye: { blinkRate: number | null; previousBlinkRate: number | null; validMinutes: number } | null;
  keyboard: {
    score: number | null; previousScore: number | null; coverage: number | null; consistency: number | null;
    judged: number; frequentKeys: { code: string; differentRate: number }[];
  } | null;
}
export interface AiReviewSection { key: 'overall' | 'upper' | 'keyboard' | 'eye'; title: string; text: string }
/** The app computes every number and judgement; the mini PC model only picks the habit that ends the overall paragraph. */
export interface AiReview {
  headline: string; sections: AiReviewSection[];
  strengths: string[]; weaknesses: string[]; goals: string[]; caution: string | null;
  model: string; generatedAt: string; adviceSource?: 'model' | 'record';
}
export type InputRow = { mode: 'upper' | 'eye' | 'keyboard'; name: string; text: string };

const oneDecimal = (value: number) => Math.round(value * 10) / 10;
const percent = (value: number | null) => (value === null ? null : oneDecimal(Math.min(100, Math.max(0, value))));
const minutes = (ms: number) => oneDecimal(ms / 60_000);
// Same grouping as the keyboard tab of Statistics: only the latest policy group is summarised.
const policyKey = (row: KeyboardStored) => JSON.stringify([row.record.policyVersion, row.record.recognitionVersion, row.record.nearbyCredit]);

function keyboardPeriod(rows: KeyboardStored[], from: string): AiReviewInput['keyboard'] {
  const latest = [...new Set(rows.map(policyKey))].at(-1);
  const records = rows.filter(row => policyKey(row) === latest);
  const credit = records[0]?.record.nearbyCredit ?? 70;
  const all = records.flatMap(row => row.counts);
  const counts = all.filter(row => row.date >= from);
  if (!counts.length) return null;
  const current = keyboardSummary(counts, credit), before = keyboardSummary(all.filter(row => row.date < from), credit);
  const byKey = new Map<string, KeyboardCount[]>();
  counts.forEach(row => byKey.set(row.code, [...(byKey.get(row.code) ?? []), row]));
  // Keys with fewer than 10 judged presses are marked "표본 부족" in Statistics, so they are left out.
  const frequentKeys = [...byKey].map(([code, keyRows]) => ({ code, ...keyboardSummary(keyRows, credit) }))
    .filter(key => key.valid >= 10 && key.nearby + key.mismatch > 0)
    .toSorted((a, b) => b.nearby + b.mismatch - a.nearby - a.mismatch).slice(0, 3)
    .map(key => ({ code: key.code, differentRate: oneDecimal((key.nearby + key.mismatch) * 100 / key.valid) }));
  return { score: percent(current.score), previousScore: percent(before.score), coverage: percent(current.coverage),
    consistency: percent(current.consistency), judged: current.valid, frequentKeys };
}

/** The numbers Statistics shows for the same period, as the whole AI request. Null when nothing was measured. */
export function aiReviewInput(summary: StatisticsSummary, keyboard: KeyboardStored[], days: PeriodDays): AiReviewInput | null {
  const { upper, eye } = summary;
  const input: AiReviewInput = {
    days,
    measuredDays: summary.days.filter(day => day.hasRecords).length,
    daily: summary.days.map(day => ({ date: day.date, neck: percent(day.upper.turtle), side: percent(day.upper.balance), keyboard: percent(day.keyboard.score) })),
    upper: upper.present ? {
      neck: { current: percent(upper.turtle.current), previous: percent(upper.turtle.previous) },
      balance: { current: percent(upper.balance.current), previous: percent(upper.balance.previous) },
      measuredMinutes: minutes(upper.runMs), sessions: upper.sessions, deviations: upper.deviations,
      deviationRate: percent(upper.deviationRate), validRate: percent(upper.validRate),
      longestMinutes: minutes(upper.longestMs),
      hourly: upper.hourly.map(({ hour, turtle, balance }) => ({ hour, neck: percent(turtle), balance: percent(balance) })),
      deviationHours: upper.deviationHours.map(({ hour, count, observedMs }) => ({ hour, count, minutes: minutes(observedMs) })),
    } : null,
    eye: eye.present ? {
      blinkRate: eye.rate === null ? null : oneDecimal(eye.rate),
      previousBlinkRate: eye.previousRate === null ? null : oneDecimal(eye.previousRate),
      validMinutes: minutes(eye.validMs),
    } : null,
    keyboard: keyboardPeriod(keyboard, summary.range.dates[0]),
  };
  return input.upper || input.eye || input.keyboard ? input : null;
}

const score = (pair: Pair, round = Math.round) => pair.current === null ? '—'
  : `${round(pair.current)}점${pair.previous === null ? '' : ` (직전 ${round(pair.previous)}점)`}`;

/** Every value of the request in words, shown before anything is sent. */
export function inputRows({ upper, eye, keyboard, localPosture }: AiReviewInput): InputRow[] {
  const rows: InputRow[] = [];
  if (localPosture) {
    const { neck, side, sideMetric, measuredMinutes, sessions, latestNeckBand: band, longestMinutes } = localPosture;
    rows.push({ mode: 'upper', name: '상체', text: [
      `목 ${score(neck, oneDecimal)}`, `${sideMetric === 'balance' ? '좌우 균형' : '어깨'} ${score(side, oneDecimal)}`,
      `측정 ${minutesText(measuredMinutes * 60_000)} · ${sessions}회`,
      ...(longestMinutes === undefined ? [] : [`가장 길게 이어진 측정 ${minutesText(longestMinutes * 60_000)}`]),
      ...(band ? [`최근 측정에서 목 ${band.fromPoints}~${band.toPoints}점 구간이 유효 시간의 ${band.percentOfValidTime}%`] : []),
    ].join(' · ') });
  }
  if (upper) rows.push({ mode: 'upper', name: '상체', text: [
    `목 ${score(upper.neck)}`, `좌우 균형 ${score(upper.balance)}`,
    `측정 ${minutesText(upper.measuredMinutes * 60_000)} · ${upper.sessions}회`,
    `기준에서 벗어남 ${upper.deviations}회 (시간 ${percentLabel(upper.deviationRate)})`,
    `제대로 측정 ${percentLabel(upper.validRate)}`, `가장 길게 이어진 측정 ${minutesText(upper.longestMinutes * 60_000)}`,
  ].join(' · ') });
  if (eye) rows.push({ mode: 'eye', name: '안구', text: [
    `깜빡임 ${rateText(eye.blinkRate)}${eye.previousBlinkRate === null ? '' : ` (직전 ${rateText(eye.previousBlinkRate)})`}`,
    `유효 관찰 ${minutesText(eye.validMinutes * 60_000)}`,
  ].join(' · ') });
  if (keyboard) rows.push({ mode: 'keyboard', name: '키보드', text: [
    `훈련 점수 ${keyboard.score === null ? '—' : keyboard.score.toFixed(1)}${keyboard.previousScore === null ? '' : ` (직전 ${keyboard.previousScore.toFixed(1)})`}`,
    `판정 가능 ${percentLabel(keyboard.coverage)}`, `일관성 ${percentLabel(keyboard.consistency)}`, `판정 ${keyboard.judged}회`,
    ...(keyboard.frequentKeys.length
      ? [`자주 다른 키 ${keyboard.frequentKeys.map(key => `${keyLabel(key.code)} ${Math.round(key.differentRate)}%`).join(', ')}`] : []),
  ].join(' · ') });
  return rows;
}

const scoreOrDash = (value: number | null) => (value === null ? '—' : String(Math.round(value)));
const hourText = (hour: number) => `${hour}시`;

/** The daily and hourly values of the request, shown on demand next to the rows above. */
export function inputDetails({ days, measuredDays, daily, upper, localPosture }: AiReviewInput): { label: string; text: string }[] {
  const side = localPosture?.sideMetric === 'shoulder' ? '어깨' : '좌우 균형';
  const details = [{ label: '측정한 날', text: `${days}일 중 ${measuredDays}일` }];
  if (daily.length) details.push({ label: '날짜별 점수', text: daily.map(day => {
    const parts = [['목', day.neck], [side, day.side], ['키보드', day.keyboard]] as const;
    const shown = parts.filter(([, value]) => value !== null).map(([name, value]) => `${name} ${scoreOrDash(value)}`);
    return `${monthDayText(day.date)} ${shown.length ? shown.join('·') : '기록 없음'}`;
  }).join(', ') });
  const hourly = localPosture?.hourly?.map(hour => ({ hour: hour.hour, neck: hour.neck, side: hour.side, minutes: hour.minutes }))
    ?? upper?.hourly.map(hour => ({ hour: hour.hour, neck: hour.neck, side: hour.balance, minutes: null }));
  if (hourly?.length) details.push({ label: '시간대별 점수', text: hourly.map(hour => `${hourText(hour.hour)} 목 ${scoreOrDash(hour.neck)}·${side} ${scoreOrDash(hour.side)}`
    + (hour.minutes === null ? '' : `(관찰 ${minutesText(hour.minutes * 60_000)})`)).join(', ') });
  if (upper?.deviationHours.length) details.push({ label: '기준 이탈 시간대', text: upper.deviationHours.map(hour => `${hourText(hour.hour)} ${hour.count}회(관찰 ${minutesText(hour.minutes * 60_000)})`).join(', ') });
  return details;
}
