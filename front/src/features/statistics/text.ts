import { monthDayText } from '../dashboard/format.ts';
import type { PeriodDays, ScoreChange } from './period.ts';

export interface TileChip { text: string; tone: 'good' | 'neutral' }
export const previousPeriodText = (days: PeriodDays) => days === 1 ? '전날' : `직전 ${days}일`;

/** "직전 7일보다 +3": green when it went up, grey when flat or down; none without both periods. */
export function changeChip(score: ScoreChange, days: PeriodDays): TileChip | null {
  if (score.change === null) return null;
  return { text: `${previousPeriodText(days)}보다 ${score.change > 0 ? '+' : ''}${score.change}`, tone: score.change > 0 ? 'good' : 'neutral' };
}

/** Blink rate is not a score, so the previous period is shown as a value only. */
export function previousRateChip(rate: number | null, days: PeriodDays): TileChip | null {
  return rate === null ? null : { text: `${previousPeriodText(days)} ${Math.round(rate)}회/분`, tone: 'neutral' };
}

export const percentLabel = (value: number | null) => (value === null ? '—' : `${Math.round(value)}%`);

/** "9월 30일 ~ 10월 6일" */
export const rangeText = (from: string, to: string) => `${monthDayText(from)} ~ ${monthDayText(to)}`;
