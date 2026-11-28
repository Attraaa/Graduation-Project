import type { LegendItem } from '../statistics/parts';

export const MODE_NAME = { upper: '상체', keyboard: '키보드' } as const;
export const MODE_DOT = { upper: 'bg-mode-upper', keyboard: 'bg-mode-keyboard' } as const;
/** Line colours of one 상체 row; the blink rate is a habit count, so it gets its own colour, never a score colour. */
export const MINUTE_LINES = {
  turtle: { key: 'turtle', name: '목', color: 'var(--color-mode-upper)' },
  balance: { key: 'balance', name: '좌우 균형', color: 'var(--color-mode-shoulder)' },
  rate: { key: 'rate', name: '깜빡임 빈도', color: 'var(--color-mode-blink)' },
} satisfies Record<string, LegendItem>;
