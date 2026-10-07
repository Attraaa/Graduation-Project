import { averageScore, localDateKey } from '../../../../database/contracts.ts';
import type { PostureRecord, StatisticsRow } from '../../../../database/contracts.ts';
import { statisticsKey } from '../../../../database/aggregation.ts';
import { eyeRate } from '../../../../database/eye.ts';
import type { EyeRecord, EyeStatisticsRow } from '../../../../database/eye.ts';
import { keyboardSummary } from '../../../../database/keyboard.ts';
import type { KeyboardStored } from '../../../../database/keyboard.ts';

export const DASHBOARD_DAYS = 7;

export interface UpperDay { turtle: number | null; shoulder: number | null; sessions: number; runMs: number; deviations: number }
export interface KeyboardDay { score: number | null; coverage: number | null; sessions: number; runMs: number; present: boolean }
export interface EyeDay { rate: number | null; runMs: number; breaks: number; present: boolean }
export interface DashboardDay { date: string; upper: UpperDay; keyboard: KeyboardDay; eye: EyeDay; totalMs: number; hasRecords: boolean }
/** Stored records behind one timeline row. The dashboard ignores it; the history screen reads it. */
export type EntrySource =
  | { mode: 'upper'; records: PostureRecord[] }
  | { mode: 'keyboard'; stored: KeyboardStored }
  | { mode: 'eye'; record: EyeRecord };
export interface TimelineEntry {
  id: string; mode: 'upper' | 'keyboard' | 'eye';
  startedAt: number; endedAt: number; offsetMinutes: number;
  turtle: number | null; shoulder: number | null; score: number | null; rate: number | null;
  interrupted: boolean;
  source: EntrySource;
}
export interface DeviationHour { hour: number; count: number; strong: boolean }
/** Rows (keyboard: records) of the latest policy group of each mode. */
export interface PolicyGroups { turtle: StatisticsRow[]; shoulder: StatisticsRow[]; eye: EyeStatisticsRow[]; keyboard: KeyboardStored[] }
/** null means the source has not loaded (or failed); it is treated as empty. */
export interface DashboardInput {
  today: string;
  posture: StatisticsRow[] | null;
  eye: EyeStatisticsRow[] | null;
  keyboard: KeyboardStored[] | null;
  history: (PostureRecord | EyeRecord)[] | null;
}
export interface DashboardSummary {
  dates: string[];
  days: DashboardDay[];
  today: DashboardDay;
  timeline: TimelineEntry[];
  deviationHours: DeviationHour[];
  chartFloor: number;
  hasScores: boolean;
  recent: { upper: boolean; keyboard: boolean; eye: boolean };
}

/** `date` moved by `days` calendar days (YYYY-MM-DD, UTC arithmetic so the local time zone never shifts it). */
export function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** `days` dates ending at `end`, oldest first. */
export function periodDates(end: string, days: number) {
  return Array.from({ length: days }, (_, index) => shiftDate(end, index - (days - 1)));
}

/** Six days before today through today, oldest first. */
export function dashboardDates(today: string) {
  return periodDates(today, DASHBOARD_DAYS);
}

/** A real YYYY-MM-DD date that is not after `today`, else null (dates read from the address bar). */
export function pastDateOrNull(value: string | null, today: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real && value <= today ? value : null;
}

/** An upper-body session is stored as `${sessionId}:turtle` and `${sessionId}:shoulder`. */
export const sessionIdOf = (recordId: string) => recordId.replace(/:(turtle|shoulder)$/, '');

const total = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((sum, row) => sum + pick(row), 0);
const hourOrder = (row: { date: string; hour: string }) => `${row.date}T${String(Number(row.hour)).padStart(2, '0')}`;

/** Different policies are never mixed: keep only the group of the latest row. */
function latestGroup<T extends { date: string; hour: string }>(rows: T[], key: (row: T) => string) {
  if (!rows.length) return [];
  const latest = rows.reduce((last, row) => (hourOrder(row) > hourOrder(last) ? row : last));
  const selected = key(latest);
  return rows.filter(row => key(row) === selected);
}

const keyboardKey = (stored: KeyboardStored) =>
  JSON.stringify([stored.record.policyVersion, stored.record.recognitionVersion, stored.record.nearbyCredit]);

function latestKeyboard(records: KeyboardStored[]) {
  if (!records.length) return [];
  const latest = records.reduce((last, stored) => (stored.record.updatedAt > last.record.updatedAt ? stored : last));
  const selected = keyboardKey(latest);
  return records.filter(stored => keyboardKey(stored) === selected);
}

/** Each mode keeps only the policy group of its latest row (keyboard: latest updated record). */
export function latestPolicyGroups(input: Pick<DashboardInput, 'posture' | 'eye' | 'keyboard'>): PolicyGroups {
  const posture = input.posture ?? [];
  return {
    turtle: latestGroup(posture.filter(row => row.mode === 'turtle'), statisticsKey),
    shoulder: latestGroup(posture.filter(row => row.mode === 'shoulder'), statisticsKey),
    eye: latestGroup(input.eye ?? [], row => row.policyVersion),
    keyboard: latestKeyboard(input.keyboard ?? []),
  };
}

function upperDay(turtle: StatisticsRow[], shoulder: StatisticsRow[], date: string): UpperDay {
  const neck = turtle.filter(row => row.date === date), side = shoulder.filter(row => row.date === date);
  const score = (rows: StatisticsRow[]) =>
    averageScore({ validMs: total(rows, row => row.validMs), scoreTimeSum: total(rows, row => row.scoreTimeSum) });
  const sessions = new Set([...neck, ...side].flatMap(row => row.recordIds).map(sessionIdOf));
  return {
    turtle: score(neck), shoulder: score(side), sessions: sessions.size,
    runMs: Math.max(total(neck, row => row.runMs), total(side, row => row.runMs)),
    deviations: total([...neck, ...side], row => row.deviationEpisodeCount),
  };
}

function keyboardDay(records: KeyboardStored[], date: string): KeyboardDay {
  const counts = records.flatMap(stored => stored.counts.filter(count => count.date === date));
  const started = records.filter(stored => localDateKey(stored.record.startedAt, stored.record.offsetMinutes) === date);
  const summary = keyboardSummary(counts, records[0]?.record.nearbyCredit ?? 70);
  return {
    score: summary.score, coverage: summary.coverage, sessions: started.length,
    runMs: total(started, stored => Math.max(0, stored.record.updatedAt - stored.record.startedAt)),
    present: counts.length > 0 || started.length > 0,
  };
}

function eyeDay(rows: EyeStatisticsRow[], date: string): EyeDay {
  const day = rows.filter(row => row.date === date);
  return {
    rate: eyeRate({ validMs: total(day, row => row.validMs), blinks: total(day, row => row.blinks) }),
    runMs: total(day, row => row.runMs), breaks: total(day, row => row.breaks), present: day.length > 0,
  };
}

/** One date's values from already selected policy groups. */
export function dayValues(groups: PolicyGroups, date: string): DashboardDay {
  const upper = upperDay(groups.turtle, groups.shoulder, date);
  const typing = keyboardDay(groups.keyboard, date);
  const eyes = eyeDay(groups.eye, date);
  return { date, upper, keyboard: typing, eye: eyes, totalMs: upper.runMs + typing.runMs + eyes.runMs,
    hasRecords: upper.sessions > 0 || typing.present || eyes.present };
}

/** Lowest score rounded down to ten and kept below 100; 0 without scores. */
export function scoreFloor(scores: number[]) {
  return scores.length ? Math.min(90, Math.max(0, Math.floor(Math.min(...scores) / 10) * 10)) : 0;
}

interface TimelineFilter { turtle: string | null; shoulder: string | null; eye: string | null }

/**
 * Rows that started on `date`, in start order: one per upper session, keyboard and eye record.
 * Without `accept` every policy is kept (history). With it, records outside the selected groups are dropped
 * (dashboard); a null key accepts all.
 */
export function dayEntries(history: (PostureRecord | EyeRecord)[], keyboard: KeyboardStored[], date: string,
  accept?: TimelineFilter): TimelineEntry[] {
  const startsOnDate = (record: { startedAt: number; offsetMinutes: number }) =>
    localDateKey(record.startedAt, record.offsetMinutes) === date;
  const entries: TimelineEntry[] = [];
  const upper = new Map<string, PostureRecord[]>();
  for (const record of history) {
    if (!startsOnDate(record)) continue;
    if (record.mode === 'eye') {
      if (accept && accept.eye !== null && record.policyVersion !== accept.eye) continue;
      entries.push({ id: record.id, mode: 'eye', startedAt: record.startedAt, endedAt: record.startedAt + record.runMs,
        offsetMinutes: record.offsetMinutes, turtle: null, shoulder: null, score: null, rate: eyeRate(record),
        interrupted: record.status === 'interrupted', source: { mode: 'eye', record } });
      continue;
    }
    const selected = accept ? (record.mode === 'turtle' ? accept.turtle : accept.shoulder) : null;
    if (selected !== null && statisticsKey(record) !== selected) continue;
    const id = sessionIdOf(record.id);
    upper.set(id, [...(upper.get(id) ?? []), record]);
  }
  for (const [id, records] of upper) {
    const neck = records.find(record => record.mode === 'turtle');
    const side = records.find(record => record.mode === 'shoulder');
    entries.push({ id, mode: 'upper',
      startedAt: Math.min(...records.map(record => record.startedAt)),
      endedAt: Math.max(...records.map(record => record.startedAt + record.runMs)),
      offsetMinutes: records[0].offsetMinutes,
      turtle: neck ? averageScore(neck) : null, shoulder: side ? averageScore(side) : null, score: null, rate: null,
      interrupted: records.some(record => record.status === 'interrupted'), source: { mode: 'upper', records } });
  }
  for (const stored of keyboard) {
    if (!startsOnDate(stored.record)) continue;
    entries.push({ id: stored.record.id, mode: 'keyboard', startedAt: stored.record.startedAt, endedAt: stored.record.updatedAt,
      offsetMinutes: stored.record.offsetMinutes, turtle: null, shoulder: null,
      score: keyboardSummary(stored.counts, stored.record.nearbyCredit).score, rate: null,
      interrupted: stored.record.status === 'interrupted', source: { mode: 'keyboard', stored } });
  }
  return entries.sort((a, b) => a.startedAt - b.startedAt);
}

/** Neck + shoulder deviation episodes per hour, from the first to the last hour with upper-body rows. */
function deviationHours(rows: StatisticsRow[]): DeviationHour[] {
  if (!rows.length) return [];
  const hours = rows.map(row => Number(row.hour));
  const first = Math.min(...hours), last = Math.max(...hours);
  const counts = Array.from({ length: last - first + 1 }, (_, index) =>
    total(rows.filter(row => Number(row.hour) === first + index), row => row.deviationEpisodeCount));
  const peak = Math.max(...counts);
  return counts.map((count, index) => ({ hour: first + index, count, strong: peak > 0 && count >= peak * 0.75 }));
}

export function buildDashboard(input: DashboardInput): DashboardSummary {
  const dates = dashboardDates(input.today);
  const groups = latestPolicyGroups(input);
  const days = dates.map(date => dayValues(groups, date));
  const scores = days.flatMap(day => [day.upper.turtle, day.upper.shoulder, day.keyboard.score])
    .filter((value): value is number => value !== null);
  return {
    dates, days, today: days[days.length - 1],
    timeline: dayEntries(input.history ?? [], groups.keyboard, input.today, {
      turtle: groups.turtle[0] ? statisticsKey(groups.turtle[0]) : null,
      shoulder: groups.shoulder[0] ? statisticsKey(groups.shoulder[0]) : null,
      eye: groups.eye[0]?.policyVersion ?? null,
    }),
    deviationHours: deviationHours([...groups.turtle, ...groups.shoulder]),
    chartFloor: scoreFloor(scores),
    hasScores: scores.length > 0,
    recent: { upper: groups.turtle.length + groups.shoulder.length > 0, keyboard: groups.keyboard.length > 0, eye: groups.eye.length > 0 },
  };
}
