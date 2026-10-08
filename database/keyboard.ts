import { localDateKey, parseQuery, recordText } from './contracts.ts';

export type KeyboardFinger = `${'left' | 'right'}:${'thumb' | 'index' | 'middle' | 'ring' | 'pinky'}`;
export type KeyboardVerdict = 'preferred' | 'acceptable' | 'nearby' | 'mismatch' | 'unknown';
export type KeyboardContext = 'plain' | 'shift-left' | 'shift-right' | 'shift-both' | 'shortcut';
export interface KeyboardCount {
  date: string; code: string; context: KeyboardContext; finger: KeyboardFinger | null;
  verdict: KeyboardVerdict; reason: string; count: number;
}
export interface KeyboardRecord {
  id: string; owner: string; startedAt: number; updatedAt: number; offsetMinutes: number;
  status: 'running' | 'finished' | 'interrupted'; policyVersion: string; recognitionVersion: string;
  nearbyCredit: number; total: number;
}
export interface KeyboardBatch {
  schemaVersion: 1; generation: number; sequence: number; record: KeyboardRecord; counts: KeyboardCount[];
}
export interface KeyboardStored { record: KeyboardRecord; counts: KeyboardCount[] }
/** Calendar entries carry a summary, never the full per-key count payload. */
export interface KeyboardHistoryRecord extends KeyboardRecord {
  mode: 'keyboard'; summary: { score: number | null; coverage: number | null; valid: number };
}
export interface KeyboardQuery { owner: string; from: string; to: string }
export const RECOGNITION_VERSION = 'hands-label-distance-v2';
export const KEYBOARD_CODES = new Set([
  ...Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`),
  ...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
  'Space', 'Comma', 'Period', 'Slash', 'Semicolon', 'Quote', 'BracketLeft', 'BracketRight',
  'Minus', 'Equal', 'Backquote', 'Backslash', 'Enter', 'Tab', 'Backspace', 'CapsLock',
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete', 'Escape', 'Home', 'End', 'PageUp', 'PageDown', 'Insert',
]);
export const KEYBOARD_REASONS = new Set(['preferred-finger', 'acceptable-alternative', 'neighboring-finger',
  'different-finger', 'unsupported-key', 'shortcut', 'low-keyboard-confidence', 'invalid-frame-timing',
  'no-reliable-candidate', 'candidate-too-far', 'ambiguous-candidates']);
const fingers = new Set(Array.from(['left', 'right'], hand =>
  ['thumb', 'index', 'middle', 'ring', 'pinky'].map(finger => `${hand}:${finger}`)).flat());
const reasons: Record<KeyboardVerdict, string[]> = {
  preferred: ['preferred-finger'], acceptable: ['acceptable-alternative'], nearby: ['neighboring-finger'],
  mismatch: ['different-finger'], unknown: [...KEYBOARD_REASONS].filter(reason => !['preferred-finger', 'acceptable-alternative', 'neighboring-finger', 'different-finger'].includes(reason)),
};
function object(input: unknown, keys: string[]) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('키보드 기록 형식이 잘못되었습니다.');
  const row = input as Record<string, unknown>;
  if (Object.keys(row).some(key => !keys.includes(key)) || keys.some(key => !(key in row))) throw new Error('키보드 기록의 지원하지 않는 필드입니다.');
  return row;
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) throw new Error('키보드 기록 수치가 잘못되었습니다.');
  return value;
}
function date(value: unknown) {
  const result = recordText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) throw new Error('키보드 날짜가 잘못되었습니다.');
  return result;
}
export function parseKeyboardRecord(input: unknown): KeyboardRecord {
  const row = object(input, ['id', 'owner', 'startedAt', 'updatedAt', 'offsetMinutes', 'status', 'policyVersion', 'recognitionVersion', 'nearbyCredit', 'total']);
  const startedAt = integer(row.startedAt, 8e12), updatedAt = integer(row.updatedAt, 8e12);
  if (updatedAt < startedAt || typeof row.offsetMinutes !== 'number' || !Number.isInteger(row.offsetMinutes) || Math.abs(row.offsetMinutes) > 840) throw new Error('키보드 시간 범위가 잘못되었습니다.');
  if (!['running', 'finished', 'interrupted'].includes(String(row.status))) throw new Error('키보드 기록 상태가 잘못되었습니다.');
  return { id: recordText(row.id), owner: recordText(row.owner), startedAt, updatedAt, offsetMinutes: row.offsetMinutes,
    status: row.status as KeyboardRecord['status'], policyVersion: recordText(row.policyVersion), recognitionVersion: recordText(row.recognitionVersion),
    nearbyCredit: integer(row.nearbyCredit, 100), total: integer(row.total) };
}
export const keyboardCountKey = (row: Omit<KeyboardCount, 'count'>) => JSON.stringify([row.date, row.code, row.context, row.finger, row.verdict, row.reason]);
export function parseKeyboardBatch(input: unknown): KeyboardBatch {
  const row = object(input, ['schemaVersion', 'generation', 'sequence', 'record', 'counts']);
  if (row.schemaVersion !== 1 || !Array.isArray(row.counts) || row.counts.length > 8000) throw new Error('지원하지 않는 키보드 배치입니다.');
  const record = parseKeyboardRecord(row.record);
  const counts = row.counts.map(input => {
    const item = object(input, ['date', 'code', 'context', 'finger', 'verdict', 'reason', 'count']);
    const code = String(item.code), context = String(item.context), verdict = String(item.verdict) as KeyboardVerdict, reason = String(item.reason);
    if (!KEYBOARD_CODES.has(code) || !['plain', 'shift-left', 'shift-right', 'shift-both', 'shortcut'].includes(context)
      || !reasons[verdict]?.includes(reason) || (verdict === 'unknown' ? item.finger !== null : !fingers.has(String(item.finger)))) throw new Error('지원하지 않는 키보드 집계입니다.');
    if ((context === 'shortcut') !== (reason === 'shortcut')) throw new Error('단축키 집계는 훈련 점수에서 제외해야 합니다.');
    const day = date(item.date);
    if (day < localDateKey(record.startedAt, record.offsetMinutes) || day > localDateKey(record.updatedAt, record.offsetMinutes)) throw new Error('키보드 집계 날짜 범위가 잘못되었습니다.');
    const count = integer(item.count); if (!count) throw new Error('빈 키보드 집계입니다.');
    return { date: day, code, context: context as KeyboardContext, finger: item.finger as KeyboardFinger | null, verdict, reason, count };
  });
  if (new Set(counts.map(keyboardCountKey)).size !== counts.length || counts.reduce((sum, item) => sum + item.count, 0) !== record.total) throw new Error('키보드 집계 합계가 일치하지 않습니다.');
  return { schemaVersion: 1, generation: integer(row.generation), sequence: integer(row.sequence), record, counts };
}
export function parseKeyboardQuery(input: unknown): KeyboardQuery {
  const row = object(input, ['owner', 'from', 'to']);
  return parseQuery(row);
}
export interface KeyboardTotals { preferred: number; acceptable: number; nearby: number; mismatch: number; unknown: number; unsupported: number }
/** Shared by per-key summaries and the server's compact calendar aggregates. */
export function keyboardTotalsSummary(totals: KeyboardTotals, nearbyCredit = 70) {
  const { preferred, acceptable, nearby, mismatch, unknown } = totals;
  const valid = preferred + acceptable + nearby + mismatch;
  return { ...totals, valid,
    score: valid ? ((preferred + acceptable) * 100 + nearby * nearbyCredit) / valid : null,
    agreement: valid ? (preferred + acceptable) * 100 / valid : null,
    coverage: valid + unknown ? valid * 100 / (valid + unknown) : null };
}
export function keyboardSummary(counts: KeyboardCount[], nearbyCredit = 70) {
  const sum = (verdict: KeyboardVerdict) => counts.filter(row => row.verdict === verdict).reduce((value, row) => value + row.count, 0);
  const preferred = sum('preferred'), acceptable = sum('acceptable'), nearby = sum('nearby'), mismatch = sum('mismatch');
  const unsupported = counts.filter(row => row.reason === 'unsupported-key' || row.reason === 'shortcut').reduce((value, row) => value + row.count, 0);
  const unknown = sum('unknown') - unsupported;
  const byKey = new Map<string, Map<string, number>>();
  for (const row of counts) if (row.finger) {
    const key = `${row.code}:${row.context}`;
    const distribution = byKey.get(key) ?? new Map<string, number>();
    distribution.set(row.finger, (distribution.get(row.finger) ?? 0) + row.count); byKey.set(key, distribution);
  }
  // Consistency only uses keys with >= 10 observed presses; single samples cannot look perfect.
  let consistent = 0, consistencyTotal = 0;
  for (const distribution of byKey.values()) {
    const n = [...distribution.values()].reduce((a, b) => a + b, 0);
    if (n >= 10) { consistencyTotal += n; consistent += Math.max(...distribution.values()); }
  }
  return { ...keyboardTotalsSummary({ preferred, acceptable, nearby, mismatch, unknown, unsupported }, nearbyCredit),
    consistency: consistencyTotal ? consistent * 100 / consistencyTotal : null, consistencyTotal };
}
