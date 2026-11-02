import { keyboardSummary } from '../../../../database/keyboard.ts';
import type { KeyboardCount, KeyboardStored } from '../../../../database/keyboard.ts';
import { minutesText, rateText } from '../dashboard/format.ts';
import { keyLabel } from '../keyboard/keyExploration.ts';
import type { PeriodDays, StatisticsSummary } from '../statistics/period.ts';
import { percentLabel } from '../statistics/text.ts';

type Pair = { current: number | null; previous: number | null };
/** Body of POST /api/ai/review (server/src/services/aiReview.ts): numbers and key codes only. */
export interface AiReviewInput {
  days: PeriodDays;
  upper: {
    neck: Pair; shoulder: Pair; measuredMinutes: number; sessions: number;
    deviations: number; deviationRate: number | null; validRate: number | null;
  } | null;
  eye: { blinkRate: number | null; previousBlinkRate: number | null; validMinutes: number } | null;
  keyboard: {
    score: number | null; previousScore: number | null; coverage: number | null; consistency: number | null;
    judged: number; frequentKeys: { code: string; differentRate: number }[];
  } | null;
}
export interface AiReview { summary: string; strengths: string[]; improvements: string[]; model: string; generatedAt: string }
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
    upper: upper.present ? {
      neck: { current: percent(upper.turtle.current), previous: percent(upper.turtle.previous) },
      shoulder: { current: percent(upper.shoulder.current), previous: percent(upper.shoulder.previous) },
      measuredMinutes: minutes(upper.runMs), sessions: upper.sessions, deviations: upper.deviations,
      deviationRate: percent(upper.deviationRate), validRate: percent(upper.validRate),
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

const score = (pair: Pair) => pair.current === null ? '—'
  : `${Math.round(pair.current)}점${pair.previous === null ? '' : ` (직전 ${Math.round(pair.previous)}점)`}`;

/** Every value of the request in words, shown before anything is sent. */
export function inputRows({ upper, eye, keyboard }: AiReviewInput): InputRow[] {
  const rows: InputRow[] = [];
  if (upper) rows.push({ mode: 'upper', name: '상체', text: [
    `목 ${score(upper.neck)}`, `어깨 ${score(upper.shoulder)}`,
    `측정 ${minutesText(upper.measuredMinutes * 60_000)} · ${upper.sessions}회`,
    `기준에서 벗어남 ${upper.deviations}회 (시간 ${percentLabel(upper.deviationRate)})`,
    `제대로 측정 ${percentLabel(upper.validRate)}`,
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
