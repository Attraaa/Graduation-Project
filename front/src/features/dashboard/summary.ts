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
export interface TimelineEntry {
  id: string; mode: 'upper' | 'keyboard' | 'eye';
  startedAt: number; endedAt: number; offsetMinutes: number;
  turtle: number | null; shoulder: number | null; score: number | null; rate: number | null;
  interrupted: boolean;
}
export interface DeviationHour { hour: number; count: number; strong: boolean }
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

/** Six days before today through today, oldest first. */
export function dashboardDates(today: string) {
  const [year, month, day] = today.split('-').map(Number);
  return Array.from({ length: DASHBOARD_DAYS }, (_, index) =>
    new Date(Date.UTC(year, month - 1, day - (DASHBOARD_DAYS - 1 - index))).toISOString().slice(0, 10));
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

export function buildDashboard(input: DashboardInput): DashboardSummary {
  const dates = dashboardDates(input.today);
  const posture = input.posture ?? [];
  const turtle = latestGroup(posture.filter(row => row.mode === 'turtle'), statisticsKey);
  const shoulder = latestGroup(posture.filter(row => row.mode === 'shoulder'), statisticsKey);
  const eye = latestGroup(input.eye ?? [], row => row.policyVersion);
  const keyboard = latestKeyboard(input.keyboard ?? []);
  const days = dates.map((date): DashboardDay => {
    const upper = upperDay(turtle, shoulder, date);
    const typing = keyboardDay(keyboard, date);
    const eyes = eyeDay(eye, date);
    return { date, upper, keyboard: typing, eye: eyes, totalMs: upper.runMs + typing.runMs + eyes.runMs,
      hasRecords: upper.sessions > 0 || typing.present || eyes.present };
  });
  const scores = days.flatMap(day => [day.upper.turtle, day.upper.shoulder, day.keyboard.score])
    .filter((value): value is number => value !== null);
  return {
    dates, days, today: days[days.length - 1],
    timeline: [],
    deviationHours: [],
    chartFloor: scores.length ? Math.min(90, Math.max(0, Math.floor(Math.min(...scores) / 10) * 10)) : 0,
    hasScores: scores.length > 0,
    recent: { upper: turtle.length + shoulder.length > 0, keyboard: keyboard.length > 0, eye: eye.length > 0 },
  };
}
