import { localDateKey } from '../../../../database/contracts.ts';

export function durationText(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? seconds + '초' : Math.floor(seconds / 60) + '분 ' + seconds % 60 + '초';
}

export function todayDateKey() { return localDateKey(Date.now(), new Date().getTimezoneOffset()); }
