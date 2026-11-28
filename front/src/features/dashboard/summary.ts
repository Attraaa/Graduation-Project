import { averageScore, localDateKey } from '../../../../database/contracts.ts';
import type { PostureRecord, StatisticsRow } from '../../../../database/contracts.ts';
import { eyeRate } from '../../../../database/eye.ts';
import type { EyeRecord, EyeStatisticsRow, HistoryRecord } from '../../../../database/eye.ts';
import { keyboardSummary } from '../../../../database/keyboard.ts';
import type { KeyboardStored } from '../../../../database/keyboard.ts';
import { cameraRunOf } from '../session/cameraRecordId.ts';

export interface UpperDay { turtle: number | null; balance: number | null; sessions: number; runMs: number; deviations: number }
export interface KeyboardDay { score: number | null; coverage: number | null; sessions: number; runMs: number; present: boolean }
export interface EyeDay { rate: number | null; runMs: number; breaks: number; present: boolean }
export interface DashboardDay { date: string; upper: UpperDay; keyboard: KeyboardDay; eye: EyeDay; totalMs: number; hasRecords: boolean }
/**
 * Stored records behind one timeline row, which the history screen opens. Since 2026-11-28 one 상체 row is one camera
 * run: its neck and balance records (every reference segment) and the eye record of the same camera (`camera:<run>:…`).
 * Records without a camera run id (before the eye merge, or an eye record without posture) stay rows of their own.
 */
export type EntrySource =
  | { mode: 'upper'; records: PostureRecord[]; eye: EyeRecord | null }
  | { mode: 'keyboard'; stored: KeyboardStored };
export interface TimelineEntry {
  id: string; mode: 'upper' | 'keyboard';
  startedAt: number; endedAt: number; offsetMinutes: number;
  turtle: number | null; balance: number | null; score: number | null; rate: number | null;
  interrupted: boolean;
  source: EntrySource;
}
/** observedMs: the longer of neck and balance observation in that hour, so a count can be read as a rate. */
export interface DeviationHour { hour: number; count: number; strong: boolean; observedMs: number }
/**
 * A record still marked running whose last save is older than this ended without its last save (the app was killed,
 * crashed or lost power). Running records save every 1–5 s, so it is shown as interrupted, not as still recording.
 */
export const STALE_RUNNING_MS = 3 * 60_000;
const ended = (status: string, lastSavedAt: number, now: number) => status === 'interrupted' || (status === 'running' && now - lastSavedAt > STALE_RUNNING_MS);
/** Rows (keyboard: records) of the latest policy group of each mode. */
export interface PolicyGroups { turtle: StatisticsRow[]; balance: StatisticsRow[]; eye: EyeStatisticsRow[]; keyboard: KeyboardStored[] }
/** null means the source has not loaded (or failed); it is treated as empty. */
export interface PolicySources { posture: StatisticsRow[] | null; eye: EyeStatisticsRow[] | null; keyboard: KeyboardStored[] | null }

/** `date` moved by `days` calendar days (YYYY-MM-DD, UTC arithmetic so the local time zone never shifts it). */
export function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** `days` dates ending at `end`, oldest first. */
export function periodDates(end: string, days: number) {
  return Array.from({ length: days }, (_, index) => shiftDate(end, index - (days - 1)));
}

/** A real YYYY-MM-DD date that is not after `today`, else null (dates read from the address bar). */
export function pastDateOrNull(value: string | null, today: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real && value <= today ? value : null;
}

/** An upper-body session is stored as `${sessionId}:turtle` and `${sessionId}:balance`. */
export const sessionIdOf = (recordId: string) => recordId.replace(/:(turtle|balance)$/, '');

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

/**
 * Upper-body rows group by score policy only: the 기준에서 벗어남 rule follows the alert setting (since 2026-11-25), so
 * changing that setting keeps earlier rows, counted with their own rule. A different score policy (including another
 * 좌우 균형 민감도) changes the score itself and starts a new group.
 */
const scoreGroup = (row: StatisticsRow) => JSON.stringify([row.mode, row.scorePolicyVersion]);

/** Each mode keeps only the policy group of its latest row (keyboard: latest updated record). */
export function latestPolicyGroups(input: PolicySources): PolicyGroups {
  const posture = input.posture ?? [];
  return {
    turtle: latestGroup(posture.filter(row => row.mode === 'turtle'), scoreGroup),
    balance: latestGroup(posture.filter(row => row.mode === 'balance'), scoreGroup),
    eye: latestGroup(input.eye ?? [], row => row.policyVersion),
    keyboard: latestKeyboard(input.keyboard ?? []),
  };
}

function upperDay(turtle: StatisticsRow[], balance: StatisticsRow[], date: string): UpperDay {
  const neck = turtle.filter(row => row.date === date), side = balance.filter(row => row.date === date);
  const score = (rows: StatisticsRow[]) =>
    averageScore({ validMs: total(rows, row => row.validMs), scoreTimeSum: total(rows, row => row.scoreTimeSum) });
  const sessions = new Set([...neck, ...side].flatMap(row => row.recordIds).map(sessionIdOf));
  return {
    turtle: score(neck), balance: score(side), sessions: sessions.size,
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

/**
 * One date's values from already selected policy groups. The eye runs in the same 상체 camera time (2026-10-10), so the
 * total takes the longer of 상체 and 안구 instead of adding them (2026-11-28; adding counted the same time twice).
 */
export function dayValues(groups: PolicyGroups, date: string): DashboardDay {
  const upper = upperDay(groups.turtle, groups.balance, date);
  const typing = keyboardDay(groups.keyboard, date);
  const eyes = eyeDay(groups.eye, date);
  return { date, upper, keyboard: typing, eye: eyes, totalMs: Math.max(upper.runMs, eyes.runMs) + typing.runMs,
    hasRecords: upper.sessions > 0 || typing.present || eyes.present };
}

/** Lowest score rounded down to ten and kept below 100; 0 without scores. */
export function scoreFloor(scores: number[]) {
  return scores.length ? Math.min(90, Math.max(0, Math.floor(Math.min(...scores) / 10) * 10)) : 0;
}

/** 상체 row key: the camera run since the eye merge, otherwise the posture session or the eye record itself. */
function upperKey(record: PostureRecord | EyeRecord) {
  const run = cameraRunOf(record.id);
  if (run) return `camera:${run}`;
  return record.mode === 'eye' ? record.id : sessionIdOf(record.id);
}

/** Valid-time weighted score of one mode's records (several reference segments of a run count together). */
const recordsScore = (records: PostureRecord[]) => (records.length
  ? averageScore({ validMs: total(records, record => record.validMs), scoreTimeSum: total(records, record => record.scoreTimeSum) })
  : null);

/**
 * Rows that started on `date`, newest first, of every policy: one 상체 row per camera run (neck, balance and eye
 * together; an older session or a lone eye record is a row of its own) and one row per keyboard record.
 */
export function dayEntries(history: HistoryRecord[], keyboard: KeyboardStored[], date: string, now = Date.now()): TimelineEntry[] {
  const startsOnDate = (record: { startedAt: number; offsetMinutes: number }) =>
    localDateKey(record.startedAt, record.offsetMinutes) === date;
  const entries: TimelineEntry[] = [];
  const upper = new Map<string, { records: PostureRecord[]; eye: EyeRecord | null }>();
  for (const record of history) {
    // Mixed history also carries compact keyboard entries; keyboard rows come once from `keyboard`.
    if (record.mode === 'keyboard') continue;
    const key = upperKey(record);
    const group = upper.get(key) ?? { records: [], eye: null };
    if (record.mode === 'eye') group.eye = record;
    else group.records.push(record);
    upper.set(key, group);
  }
  for (const [id, { records, eye }] of upper) {
    const spans = [...records, ...(eye ? [eye] : [])]
      .map(record => ({ start: record.startedAt, end: record.startedAt + record.runMs, status: record.status }));
    const first = records[0] ?? eye;
    const startedAt = Math.min(...spans.map(span => span.start));
    // A run that crosses midnight stays one row, on the date it started.
    if (!first || !startsOnDate({ startedAt, offsetMinutes: first.offsetMinutes })) continue;
    entries.push({ id, mode: 'upper', startedAt,
      endedAt: Math.max(...spans.map(span => span.end)),
      offsetMinutes: first.offsetMinutes,
      turtle: recordsScore(records.filter(record => record.mode === 'turtle')),
      balance: recordsScore(records.filter(record => record.mode === 'balance')),
      score: null, rate: eye ? eyeRate(eye) : null,
      interrupted: spans.some(span => ended(span.status, span.end, now)), source: { mode: 'upper', records, eye } });
  }
  for (const stored of keyboard) {
    if (!startsOnDate(stored.record)) continue;
    entries.push({ id: stored.record.id, mode: 'keyboard', startedAt: stored.record.startedAt, endedAt: stored.record.updatedAt,
      offsetMinutes: stored.record.offsetMinutes, turtle: null, balance: null,
      score: keyboardSummary(stored.counts, stored.record.nearbyCredit).score, rate: null,
      interrupted: ended(stored.record.status, stored.record.updatedAt, now), source: { mode: 'keyboard', stored } });
  }
  return entries.sort((a, b) => b.startedAt - a.startedAt);
}

/** Neck + balance deviation episodes per hour, from the first to the last hour with upper-body rows. */
export function deviationHours(rows: StatisticsRow[]): DeviationHour[] {
  if (!rows.length) return [];
  const hours = rows.map(row => Number(row.hour));
  const first = Math.min(...hours), last = Math.max(...hours);
  const atHour = Array.from({ length: last - first + 1 }, (_, index) => rows.filter(row => Number(row.hour) === first + index));
  const counts = atHour.map(hourRows => total(hourRows, row => row.deviationEpisodeCount));
  const observed = (hourRows: StatisticsRow[], mode: string) => total(hourRows.filter(row => row.mode === mode), row => row.validMs);
  const peak = Math.max(...counts);
  return counts.map((count, index) => ({ hour: first + index, count, strong: peak > 0 && count >= peak * 0.75,
    observedMs: Math.max(observed(atHour[index], 'turtle'), observed(atHour[index], 'balance')) }));
}
