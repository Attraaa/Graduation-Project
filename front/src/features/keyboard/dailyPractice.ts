import { keyboardSummary, type KeyboardStored } from '../../../../database/keyboard.ts';

/** Input counts are stored by date. Use the session start within the day to label each day's session portion. */
export function dailyKeyboardPractice(records: KeyboardStored[], date: string) {
  const midnightUtc = Date.parse(`${date}T00:00:00Z`);
  return records.flatMap(({ record, counts }) => {
    const onDay = counts.filter(count => count.date === date);
    if (!onDay.length) return [];
    const { score, coverage } = keyboardSummary(onDay, record.nearbyCredit);
    const at = Math.max(record.startedAt, midnightUtc + record.offsetMinutes * 60_000);
    return [{ at, offsetMinutes: record.offsetMinutes, score, coverage }];
  }).sort((a, b) => a.at - b.at);
}
