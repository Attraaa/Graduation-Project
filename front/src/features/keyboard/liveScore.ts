import type { KeyboardLiveResult } from './runtime';
import { keyboardTotalsSummary } from '../../../../database/keyboard.ts';

export function livePressScore(press: KeyboardLiveResult | null): number | null {
  if (!press || press.evaluation.verdict === 'unknown') return null;
  return keyboardTotalsSummary({ preferred: 0, acceptable: 0, nearby: 0, mismatch: 0, unknown: 0, unsupported: 0,
    [press.evaluation.verdict]: 1 }).score;
}
