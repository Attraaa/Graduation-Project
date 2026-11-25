import type { KeyboardLiveResult } from './runtime';
import { keyboardTotalsSummary } from '../../../../database/keyboard.ts';

/** The live keyboard score (home dial and graph, overlay, alert) averages this many latest judged presses. */
export const LIVE_SCORE_WINDOW = 50;

export function livePressScore(press: KeyboardLiveResult | null): number | null {
  if (!press || press.evaluation.verdict === 'unknown') return null;
  return keyboardTotalsSummary({ preferred: 0, acceptable: 0, nearby: 0, mismatch: 0, unknown: 0, unsupported: 0,
    [press.evaluation.verdict]: 1 }).score;
}

/** The last 50 judged press scores after `press`; a press that could not be judged leaves them as they were. */
export function addLiveScore(scores: readonly number[], press: KeyboardLiveResult | null): number[] {
  const score = livePressScore(press);
  return score === null ? [...scores] : [...scores, score].slice(-LIVE_SCORE_WINDOW);
}

/** Whole-number average of those scores; null before the first judged press. */
export function liveAverage(scores: readonly number[]): number | null {
  return scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
}
