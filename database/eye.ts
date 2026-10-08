import { recordText } from './contracts.ts';
import type { PostureRecord, RecordStatus } from './contracts.ts';
import type { KeyboardHistoryRecord } from './keyboard.ts';

export const eyeFields = ['runMs', 'validMs', 'blinks', 'breaks', 'nearReminders', 'openReminders'] as const;
export const emptyEyeTotals = () => ({ runMs: 0, validMs: 0, blinks: 0, breaks: 0, nearReminders: 0, openReminders: 0 });
export type EyeTotals = ReturnType<typeof emptyEyeTotals>;
export interface EyeRecord extends EyeTotals {
  id: string; owner: string; mode: 'eye'; startedAt: number; updatedAt: number;
  offsetMinutes: number; policyVersion: string; status: RecordStatus;
}
export interface EyeBucket extends EyeTotals { minute: number }
export interface EyeBatch { schemaVersion: 1; generation: number; sequence: number; record: EyeRecord; buckets: EyeBucket[] }
export interface EyeDetail { record: EyeRecord; buckets: EyeBucket[] }
export interface EyeStatisticsRow extends EyeTotals { date: string; hour: string; policyVersion: string; sessionCount: number }
export type HistoryRecord = PostureRecord | EyeRecord | KeyboardHistoryRecord;
export interface HistoryPage { counts: Record<string, number>; records: HistoryRecord[]; hasMore: boolean }
// Same minimum observation time as eye-habits-v2; missing observation is not zero.
export const eyeRate = (value: Pick<EyeTotals, 'validMs' | 'blinks'>) => value.validMs >= 30000 ? value.blinks * 60000 / value.validMs : null;

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('안구 기록 형식이 올바르지 않습니다.');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !keys.includes(key)) || keys.some(key => !(key in row))) throw new Error('지원하지 않는 안구 기록 필드입니다.');
  return row;
}
function number(value: unknown, integer = false, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isSafeInteger(value)))
    throw new Error('안구 기록 수치가 올바르지 않습니다.');
  return value;
}
function totals(row: Record<string, unknown>): EyeTotals {
  const result = Object.fromEntries(eyeFields.map(key => [key, number(row[key], !key.endsWith('Ms'))])) as EyeTotals;
  if (result.validMs > result.runMs + 0.01) throw new Error('안구 관측 시간이 실행 시간을 초과했습니다.');
  return result;
}
export function parseEyeRecord(value: unknown): EyeRecord {
  const row = object(value, [...eyeFields, 'id', 'owner', 'mode', 'startedAt', 'updatedAt', 'offsetMinutes', 'policyVersion', 'status']);
  if (row.mode !== 'eye' || (row.status !== 'running' && row.status !== 'finished' && row.status !== 'interrupted')) throw new Error('안구 기록 상태가 올바르지 않습니다.');
  const startedAt = number(row.startedAt, false, 8e12), updatedAt = number(row.updatedAt, false, 8e12);
  if (typeof row.offsetMinutes !== 'number' || !Number.isInteger(row.offsetMinutes) || Math.abs(row.offsetMinutes) > 840) throw new Error('시간대가 올바르지 않습니다.');
  const result: EyeRecord = { ...totals(row), id: recordText(row.id), owner: recordText(row.owner), mode: 'eye',
    startedAt, updatedAt, offsetMinutes: row.offsetMinutes, policyVersion: recordText(row.policyVersion), status: row.status as RecordStatus };
  if (updatedAt < startedAt || Math.abs(updatedAt - startedAt - result.runMs) > 0.01) throw new Error('안구 기록 시간 범위가 일치하지 않습니다.');
  return result;
}
export function parseEyeBatch(value: unknown): EyeBatch {
  const row = object(value, ['schemaVersion', 'generation', 'sequence', 'record', 'buckets']);
  if (row.schemaVersion !== 1 || !Array.isArray(row.buckets) || row.buckets.length > 120) throw new Error('지원하지 않는 안구 배치입니다.');
  const record = parseEyeRecord(row.record);
  const buckets = row.buckets.map(value => {
    const raw = object(value, [...eyeFields, 'minute']), minute = number(raw.minute, true, 8e12);
    const bucket = { ...totals(raw), minute };
    if (minute % 60000 || minute + 60000 <= record.startedAt || minute > record.updatedAt || bucket.runMs > 60000.01)
      throw new Error('안구 시간 버킷 범위가 올바르지 않습니다.');
    return bucket;
  });
  if (new Set(buckets.map(row => row.minute)).size !== buckets.length) throw new Error('중복 안구 시간 버킷입니다.');
  return { schemaVersion: 1, generation: number(row.generation, true), sequence: number(row.sequence, true), record, buckets };
}
