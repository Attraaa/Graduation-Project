// Display strings only. Calculation rules live in summary.ts.
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const parts = (date: string) => date.split('-').map(Number) as [number, number, number];
const weekday = (date: string) => {
  const [year, month, day] = parts(date);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
};

/** "10월 6일 화요일" */
export function headerDate(date: string) {
  const [, month, day] = parts(date);
  return `${month}월 ${day}일 ${weekday(date)}요일`;
}

/** "10월 4일 (일)" */
export function longDate(date: string) {
  const [, month, day] = parts(date);
  return `${month}월 ${day}일 (${weekday(date)})`;
}

/** Chart x-axis: "오늘" for today, otherwise "수 9/30". */
export function dayLabel(date: string, today: string) {
  if (date === today) return '오늘';
  const [, month, day] = parts(date);
  return `${weekday(date)} ${month}/${day}`;
}

/** "1시간 23분", "25분"; a short non-zero time is "1분 미만", not 0. */
export function minutesText(ms: number) {
  if (ms <= 0) return '0분';
  const minutes = Math.round(ms / 60_000);
  if (minutes === 0) return '1분 미만';
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (!hours) return `${rest}분`;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

/** Local clock of the record, e.g. "09:12". */
export function clockText(epoch: number, offsetMinutes: number) {
  return new Date(epoch - offsetMinutes * 60_000).toISOString().slice(11, 16);
}

export function scoreText(value: number | null) {
  return value === null ? '—' : String(Math.round(value));
}

/** Blink rate is never a score; missing observation is "자료 부족", not zero. */
export function rateText(value: number | null) {
  return value === null ? '자료 부족' : `분당 ${Math.round(value)}회`;
}

/** "9월 30일" */
export function monthDayText(date: string) {
  const [, month, day] = parts(date);
  return `${month}월 ${day}일`;
}
