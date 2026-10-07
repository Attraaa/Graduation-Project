import type { PostureRecord } from '../../../../database/contracts.ts';
import type { EyeRecord } from '../../../../database/eye.ts';
import { keyboardSummary } from '../../../../database/keyboard.ts';
import type { KeyboardStored } from '../../../../database/keyboard.ts';
import { monthDayText } from '../dashboard/format.ts';
import { dayEntries, shiftDate } from '../dashboard/summary.ts';
import type { EntrySource, TimelineEntry } from '../dashboard/summary.ts';
import { isLegacy } from './currentPolicies.ts';

export type CalendarView = 'week' | 'month';
export type EntryMode = TimelineEntry['mode'];
/** A timeline row plus the history tags. */
export interface HistoryEntry extends TimelineEntry { legacy: boolean; running: boolean; coverage: number | null }
export interface CalendarDay { date: string; modes: EntryMode[]; totalMs: number; isToday: boolean; isFuture: boolean }

const MODES: EntryMode[] = ['upper', 'keyboard', 'eye'];
const parts = (date: string) => date.split('-').map(Number) as [number, number, number];
const utcDate = (year: number, monthIndex: number, day: number) => new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);

/** 0 = Sunday. */
export function weekdayIndex(date: string) {
  const [year, month, day] = parts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Sunday-to-Saturday week that contains `date`. */
export function weekDates(date: string) {
  const start = shiftDate(date, -weekdayIndex(date));
  return Array.from({ length: 7 }, (_, index) => shiftDate(start, index));
}

/** Every date of the month that contains `date`. */
export function monthDates(date: string) {
  const [year, month] = parts(date);
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length }, (_, index) => utcDate(year, month - 1, index + 1));
}

export const visibleDates = (view: CalendarView, date: string) => (view === 'week' ? weekDates(date) : monthDates(date));

/** Empty cells before the first day so a month grid starts on Sunday. */
export const leadingBlanks = (view: CalendarView, dates: string[]) => (view === 'month' ? weekdayIndex(dates[0]) : 0);

/** "9월 27일 ~ 10월 3일" for a week, "2026년 10월" for a month. */
export function periodTitle(view: CalendarView, dates: string[]) {
  if (view === 'week') return `${monthDayText(dates[0])} ~ ${monthDayText(dates[dates.length - 1])}`;
  const [year, month] = parts(dates[0]);
  return `${year}년 ${month}월`;
}

/** Every date from `from` to `to`, both included. */
export function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  for (let date = from; date <= to; date = shiftDate(date, 1)) dates.push(date);
  return dates;
}

/** The shown dates plus one week on each side, never past today. */
export function loadRange(view: CalendarView, date: string, today: string) {
  const dates = visibleDates(view, date);
  const to = shiftDate(dates[dates.length - 1], 7);
  return { from: shiftDate(dates[0], -7), to: to > today ? today : to };
}

/** ◀ ▶ move a week, or a month to its first day; a date past today becomes today. */
export function movePeriod(view: CalendarView, date: string, direction: -1 | 1, today: string) {
  const [year, month] = parts(date);
  const next = view === 'week' ? shiftDate(date, direction * 7) : utcDate(year, month - 1 + direction, 1);
  return next > today ? today : next;
}

/** ▶ is disabled when the next period starts after today. */
export function canMoveForward(view: CalendarView, date: string, today: string) {
  const dates = visibleDates(view, date);
  return shiftDate(dates[dates.length - 1], 1) <= today;
}

export const entryKey = (entry: TimelineEntry) => `${entry.mode}:${entry.id}`;
export const entryMs = (entry: TimelineEntry) => Math.max(0, entry.endedAt - entry.startedAt);

const statuses = (source: EntrySource) =>
  source.mode === 'upper' ? source.records.map(record => record.status)
    : source.mode === 'eye' ? [source.record.status] : [source.stored.record.status];

/** Rows per date with every policy kept: one per upper session, keyboard and eye record, in start order. */
export function entriesByDate(history: (PostureRecord | EyeRecord)[], keyboard: KeyboardStored[], dates: string[]) {
  const byDate = new Map<string, HistoryEntry[]>();
  for (const date of dates) {
    byDate.set(date, dayEntries(history, keyboard, date).map((entry): HistoryEntry => ({
      ...entry,
      legacy: isLegacy(entry.source),
      running: !entry.interrupted && statuses(entry.source).includes('running'),
      coverage: entry.source.mode === 'keyboard'
        ? keyboardSummary(entry.source.stored.counts, entry.source.stored.record.nearbyCredit).coverage : null,
    })));
  }
  return byDate;
}

/** Calendar cells: the modes and the summed length of the same rows the list shows. */
export function calendarDays(dates: string[], byDate: Map<string, HistoryEntry[]>, today: string): CalendarDay[] {
  return dates.map(date => {
    const entries = byDate.get(date) ?? [];
    return { date, modes: MODES.filter(mode => entries.some(entry => entry.mode === mode)),
      totalMs: entries.reduce((sum, entry) => sum + entryMs(entry), 0), isToday: date === today, isFuture: date > today };
  });
}

/** Closest dates with rows before and after `date` inside the loaded range; never after today. */
export function neighborDates(byDate: Map<string, HistoryEntry[]>, date: string, today: string) {
  const recorded = [...byDate].filter(([day, entries]) => entries.length > 0 && day <= today).map(([day]) => day).sort();
  return { previous: recorded.filter(day => day < date).at(-1) ?? null, next: recorded.find(day => day > date) ?? null };
}
