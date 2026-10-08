import { keyboardSummary } from '../../../../database/keyboard.ts';
import type { KeyboardCount, KeyboardFinger } from '../../../../database/keyboard.ts';
import { ANSI_QWERTY_TOUCH_POLICY_V1 } from './fingerPolicy.ts';

export const keyboardRows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map(letters => [...letters].map(letter => `Key${letter}`));
keyboardRows[1].push('Semicolon');
keyboardRows[2].push('Comma', 'Period', 'Slash');
keyboardRows.push(['Space']);
const labels: Record<string, string> = { Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Space: 'Space' };
export const keyLabel = (code: string) => code.startsWith('Key') ? code.slice(3) : labels[code] ?? code;

export function exploreKeys(counts: KeyboardCount[], nearbyCredit: number) {
  const groups = new Map<string, KeyboardCount[]>();
  for (const row of counts) groups.set(row.code, [...(groups.get(row.code) ?? []), row]);
  return [...groups].map(([code, rows]) => {
    const fingers = new Map<KeyboardFinger, number>();
    for (const row of rows) if (row.finger) fingers.set(row.finger, (fingers.get(row.finger) ?? 0) + row.count);
    return { code, rows, total: rows.reduce((n, row) => n + row.count, 0), ...keyboardSummary(rows, nearbyCredit),
      fingers: [...fingers].map(([finger, count]) => ({ finger, count })).sort((a, b) => b.count - a.count || a.finger.localeCompare(b.finger)) };
  });
}
export type ExploredKey = ReturnType<typeof exploreKeys>[number];
/** A coaching list based on observed differences, never on unknown observations. */
export function practiceKeys(keys: ExploredKey[]) {
  return keys.filter(key => key.valid >= 10 && key.nearby + key.mismatch > 0)
    .map(key => ({ ...key, differenceRate: (key.nearby + key.mismatch) / key.valid }))
    .sort((a, b) => b.differenceRate - a.differenceRate || b.nearby + b.mismatch - a.nearby - a.mismatch || a.code.localeCompare(b.code))
    .slice(0, 3);
}
export function keyRuleFor(policyVersion: string, code: string) {
  const policy = ANSI_QWERTY_TOUCH_POLICY_V1;
  // Do not describe historical/future records with a different policy's baseline.
  return policyVersion === `${policy.id}:${policy.version}` ? policy.keys[code] ?? null : null;
}
