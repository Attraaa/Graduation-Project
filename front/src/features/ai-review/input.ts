import { eyeRate } from '../../../../database/eye.ts';
import type { EyeStatisticsRow } from '../../../../database/eye.ts';
import { keyboardSummary } from '../../../../database/keyboard.ts';
import type { KeyboardCount, KeyboardStored } from '../../../../database/keyboard.ts';
import type { DailyPostureReview, DailyReviewInput } from '../../../../database/localReview.ts';
import { minutesText, rateText } from '../dashboard/format.ts';
import { exploreKeys, keyLabel } from '../keyboard/keyExploration.ts';
import { percentLabel } from '../statistics/text.ts';

export interface AiReviewSection { key: 'overall' | 'upper' | 'keyboard' | 'eye'; title: string; text: string }
export interface AiReview {
  headline: string; sections: AiReviewSection[];
  strengths: string[]; weaknesses: string[]; goals: string[]; caution: string | null;
  model: string; generatedAt: string;
}
export type InputRow = { mode: 'upper' | 'eye' | 'keyboard'; name: string; text: string };
export type EyeReviewRow = Pick<EyeStatisticsRow, 'date' | 'validMs' | 'blinks'>;

const oneDecimal = (value: number) => Math.round(value * 10) / 10;
const percent = (value: number | null) => value === null ? null : oneDecimal(Math.min(100, Math.max(0, value)));
const postureLabel = { neck: '목', balance: '좌우 균형', shoulder: '어깨' };

function keyboardForDate(sessions: KeyboardStored[], date: string): DailyReviewInput['keyboard'] {
  const counts: KeyboardCount[] = [];
  let nearbyCount = 0;
  let nearbyScoreSum = 0;
  for (const session of sessions) {
    for (const row of session.counts) {
      if (row.date !== date) continue;
      counts.push(row);
      if (row.verdict === 'nearby') {
        nearbyCount += row.count;
        nearbyScoreSum += row.count * session.record.nearbyCredit;
      }
    }
  }
  if (!counts.length) return null;
  // A nearby press retains the credit in effect when it was recorded.
  const credit = nearbyCount ? nearbyScoreSum / nearbyCount : 70;
  const current = keyboardSummary(counts, credit);
  const frequentKeys = exploreKeys(counts, credit)
    .filter(key => key.valid >= 10 && key.nearby + key.mismatch > 0)
    .toSorted((a, b) => b.nearby + b.mismatch - a.nearby - a.mismatch).slice(0, 3)
    .map(key => ({ code: key.code, differentRate: oneDecimal((key.nearby + key.mismatch) * 100 / key.valid) }));
  return { score: percent(current.score), coverage: percent(current.coverage), consistency: percent(current.consistency),
    judged: current.valid, frequentKeys };
}

export function buildDailyReviewInput(date: string, posture: DailyPostureReview | null, eyeRows: EyeReviewRow[], keyboardSessions: KeyboardStored[]): DailyReviewInput | null {
  const eyeTotals = eyeRows.filter(row => row.date === date).reduce((sum, row) =>
    ({ validMs: sum.validMs + row.validMs, blinks: sum.blinks + row.blinks }), { validMs: 0, blinks: 0 });
  const blinkRate = eyeRate(eyeTotals);
  const eye = eyeTotals.validMs > 0
    ? { blinkRate: blinkRate === null ? null : oneDecimal(blinkRate), validMinutes: eyeTotals.validMs / 60_000 } : null;
  const keyboard = keyboardForDate(keyboardSessions, date);
  return posture || eye || keyboard ? { date, posture, eye, keyboard } : null;
}

export function inputRows({ posture, eye, keyboard }: DailyReviewInput): InputRow[] {
  const rows: InputRow[] = [];
  if (posture) rows.push({ mode: 'upper', name: '상체', text: [
    ...posture.scores.map(score => `${postureLabel[score.metric]} ${oneDecimal(score.mean)}점`),
    `측정 ${minutesText(posture.measuredMinutes * 60_000)} · ${posture.sessions}회`,
  ].join(' · ') });
  if (eye) rows.push({ mode: 'eye', name: '안구', text: [
    `깜빡임 ${rateText(eye.blinkRate)}`, `유효 관찰 ${minutesText(eye.validMinutes * 60_000)}`,
  ].join(' · ') });
  if (keyboard) rows.push({ mode: 'keyboard', name: '키보드', text: [
    `훈련 점수 ${keyboard.score === null ? '—' : keyboard.score.toFixed(1)}`,
    `판정 가능 ${percentLabel(keyboard.coverage)}`, `일관성 ${percentLabel(keyboard.consistency)}`, `판정 ${keyboard.judged}회`,
    ...(keyboard.frequentKeys.length
      ? [`자주 다른 키 ${keyboard.frequentKeys.map(key => `${keyLabel(key.code)} ${Math.round(key.differentRate)}%`).join(', ')}`] : []),
  ].join(' · ') });
  return rows;
}
