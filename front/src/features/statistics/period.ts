import { averageScore } from '../../../../database/contracts.ts';
import type { StatisticsRow } from '../../../../database/contracts.ts';
import { eyeRate } from '../../../../database/eye.ts';
import type { EyeStatisticsRow } from '../../../../database/eye.ts';
import type { KeyboardStored } from '../../../../database/keyboard.ts';
import { dayValues, latestPolicyGroups, periodDates, scoreFloor, sessionIdOf, shiftDate } from '../dashboard/summary.ts';
import type { DashboardDay } from '../dashboard/summary.ts';

export type PeriodDays = 7 | 30;
export interface StatisticsRange { from: string; to: string; dates: string[]; previousDates: string[] }
export interface ScoreChange { current: number | null; previous: number | null; change: number | null }
// Type aliases, not interfaces, so the rows fit the charts' index-signature data type.
export type UpperHour = { hour: number; turtle: number | null; shoulder: number | null };
export type EyeHour = { hour: number; rate: number | null };
export interface UpperPeriod {
  present: boolean;
  turtle: ScoreChange; shoulder: ScoreChange;
  runMs: number; sessions: number; averageMs: number | null; longestMs: number;
  deviations: number; deviationRate: number | null;
  validRate: number | null; unmeasuredMs: number;
  hourly: UpperHour[]; hourlyFloor: number;
}
export interface EyePeriod {
  present: boolean;
  rate: number | null; previousRate: number | null;
  validMs: number; runMs: number; breaks: number; nearReminders: number; openReminders: number;
  validRate: number | null;
  hourly: EyeHour[]; hourlyMax: number;
}
/** null means the source has not loaded (or failed); it is treated as empty. */
export interface StatisticsInput {
  end: string; days: PeriodDays;
  posture: StatisticsRow[] | null; eye: EyeStatisticsRow[] | null; keyboard: KeyboardStored[] | null;
}
export interface StatisticsSummary {
  range: StatisticsRange; days: DashboardDay[]; upper: UpperPeriod; eye: EyePeriod; upperFloor: number; eyeMax: number;
}

/** The current period ends at `end`; the previous period has the same length right before it. */
export function statisticsRange(end: string, days: PeriodDays): StatisticsRange {
  const dates = periodDates(end, days);
  const previousDates = periodDates(shiftDate(end, -days), days);
  return { from: previousDates[0], to: end, dates, previousDates };
}

const sum = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((value, row) => value + pick(row), 0);
const present = (values: (number | null)[]) => values.filter((value): value is number => value !== null);
const inDates = <T extends { date: string }>(rows: T[], dates: string[]) => rows.filter(row => dates.includes(row.date));
const atHour = <T extends { hour: string }>(rows: T[], hour: number) => rows.filter(row => Number(row.hour) === hour);
const share = (part: number, whole: number) => (whole > 0 ? (100 * part) / whole : null);
const weightedScore = (rows: StatisticsRow[]) =>
  averageScore({ validMs: sum(rows, row => row.validMs), scoreTimeSum: sum(rows, row => row.scoreTimeSum) });
/** Blink-rate axis top: at least 20, otherwise the highest value rounded up to five. */
const rateCeiling = (values: (number | null)[]) => Math.max(20, Math.ceil(Math.max(0, ...present(values)) / 5) * 5);

/** Hours from the first to the last hour that has rows. */
function hourRange(rows: { hour: string }[]) {
  if (!rows.length) return [];
  const hours = rows.map(row => Number(row.hour));
  const first = Math.min(...hours), last = Math.max(...hours);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

/** Compared as the integers shown on screen; null when either period has no value. */
function scoreChange(current: number | null, previous: number | null): ScoreChange {
  return { current, previous, change: current === null || previous === null ? null : Math.round(current) - Math.round(previous) };
}

function upperPeriod(turtle: StatisticsRow[], shoulder: StatisticsRow[], range: StatisticsRange, days: DashboardDay[]): UpperPeriod {
  const neck = inDates(turtle, range.dates), side = inDates(shoulder, range.dates);
  const both = [...neck, ...side];
  const runMs = sum(days, day => day.upper.runMs);
  const sessions = new Set(both.flatMap(row => row.recordIds).map(sessionIdOf)).size;
  const validRate = share(sum(both, row => row.validMs), sum(both, row => row.runMs));
  const hourly = hourRange(both).map(hour => ({ hour,
    turtle: weightedScore(atHour(neck, hour)), shoulder: weightedScore(atHour(side, hour)) }));
  return {
    present: both.length > 0,
    turtle: scoreChange(weightedScore(neck), weightedScore(inDates(turtle, range.previousDates))),
    shoulder: scoreChange(weightedScore(side), weightedScore(inDates(shoulder, range.previousDates))),
    runMs, sessions,
    averageMs: sessions ? runMs / sessions : null,
    longestMs: Math.max(0, ...both.map(row => row.longestContinuousMs)),
    deviations: sum(both, row => row.deviationEpisodeCount),
    deviationRate: share(sum(both, row => row.deviationMs), sum(both, row => row.validMs)),
    validRate,
    unmeasuredMs: validRate === null ? 0 : runMs * (1 - validRate / 100),
    hourly,
    hourlyFloor: scoreFloor(present(hourly.flatMap(hour => [hour.turtle, hour.shoulder]))),
  };
}

function eyeTotals(rows: EyeStatisticsRow[]) {
  return { runMs: sum(rows, row => row.runMs), validMs: sum(rows, row => row.validMs), blinks: sum(rows, row => row.blinks),
    breaks: sum(rows, row => row.breaks), nearReminders: sum(rows, row => row.nearReminders),
    openReminders: sum(rows, row => row.openReminders) };
}

function eyePeriod(rows: EyeStatisticsRow[], range: StatisticsRange): EyePeriod {
  const current = inDates(rows, range.dates);
  const totals = eyeTotals(current);
  const hourly = hourRange(current).map(hour => ({ hour, rate: eyeRate(eyeTotals(atHour(current, hour))) }));
  return {
    present: current.length > 0,
    rate: eyeRate(totals), previousRate: eyeRate(eyeTotals(inDates(rows, range.previousDates))),
    validMs: totals.validMs, runMs: totals.runMs, breaks: totals.breaks,
    nearReminders: totals.nearReminders, openReminders: totals.openReminders,
    validRate: share(totals.validMs, totals.runMs),
    hourly, hourlyMax: rateCeiling(hourly.map(hour => hour.rate)),
  };
}

/** Policy groups are chosen over both periods (dashboard rule), so the comparison never mixes policies. */
export function buildStatistics(input: StatisticsInput): StatisticsSummary {
  const range = statisticsRange(input.end, input.days);
  const groups = latestPolicyGroups(input);
  const days = range.dates.map(date => dayValues(groups, date));
  return {
    range, days,
    upper: upperPeriod(groups.turtle, groups.shoulder, range, days),
    eye: eyePeriod(groups.eye, range),
    upperFloor: scoreFloor(present(days.flatMap(day => [day.upper.turtle, day.upper.shoulder]))),
    eyeMax: rateCeiling(days.map(day => day.eye.rate)),
  };
}
