import { keyboardSummary } from '../../../../database/keyboard.ts';
import type { MonitoringState } from './monitoringContext';
import type { MonitoringMode } from './modes';

type Score = { averageScore: number | null; validMs: number };
type WeightedScore = { sum: number; ms: number };
type Part = 'neck' | 'balance';
export const emptyScoreTotals = (): Record<Part, WeightedScore> => ({ neck: { sum: 0, ms: 0 }, balance: { sum: 0, ms: 0 } });

function addScore(total: WeightedScore, score: Score): WeightedScore {
  return score.averageScore === null ? total : { sum: total.sum + score.averageScore * score.validMs, ms: total.ms + score.validMs };
}

export function addPostureSegment(total: Record<Part, WeightedScore>, scores: Record<Part, Score>) {
  return { neck: addScore(total.neck, scores.neck), balance: addScore(total.balance, scores.balance) };
}

export function postureRunAverages(total: Record<Part, WeightedScore>, current: Record<Part, Score>) {
  const scores = addPostureSegment(total, current);
  return { neck: scores.neck.ms ? scores.neck.sum / scores.neck.ms : null, balance: scores.balance.ms ? scores.balance.sum / scores.balance.ms : null };
}

type Metric = { label: string; value: number | null; unit: '점' | '회/분' | '회' | '%'; digits?: number };
export interface MeasurementSummary { seconds: number; metrics: Metric[] }

export function measurementSummary(all: MonitoringState, mode: MonitoringMode, seconds: number): MeasurementSummary {
  if (mode === 'keyboard') {
    const keys = keyboardSummary(all.keyboard.snapshot.counts);
    return { seconds, metrics: [
      { label: '평균 훈련 점수', value: keys.score, unit: '점' },
      { label: '판정한 입력', value: keys.valid, unit: '회' },
      { label: '판정 가능 비율', value: keys.coverage, unit: '%', digits: 1 },
    ] };
  }
  return { seconds, metrics: [
    { label: '목 평균', value: all.upper.snapshot.runAverages.neck, unit: '점' },
    { label: '좌우 균형 평균', value: all.upper.snapshot.runAverages.balance, unit: '점' },
    { label: '평균 깜빡임', value: all.upper.eye.measurement.blinksPerMinute, unit: '회/분', digits: 1 },
  ] };
}

export function measurementDuration(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600), minutes = Math.floor(whole / 60) % 60, rest = whole % 60;
  return [hours && `${hours}시간`, minutes && `${minutes}분`, (rest || !whole) && `${rest}초`].filter(Boolean).join(' ');
}
