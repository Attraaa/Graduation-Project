/** Portable records. No Electron, React, SQL, images or credentials in this contract. */
export type RecordMode = 'turtle' | 'shoulder';
export type RecordStatus = 'running' | 'finished' | 'interrupted';
export const RECORD_VERSION = 1;
export const AGGREGATION_VERSION = 'capture-minute-v1';

export interface Totals {
  runMs: number;
  validMs: number;
  scoreTimeSum: number;
  deviationMs: number;
  deviationEpisodeCount: number;
}
export interface PostureRecord extends Totals {
  id: string;
  owner: string;
  mode: RecordMode;
  startedAt: number;
  updatedAt: number;
  offsetMinutes: number;
  scorePolicyVersion: string;
  habitPolicyVersion: string;
  longestContinuousMs: number;
  status: RecordStatus;
}
export interface MinuteBucket extends Totals {
  minute: number;
}
export interface RecordBatch {
  schemaVersion: 1;
  aggregationPolicyVersion: typeof AGGREGATION_VERSION;
  generation: number;
  sequence: number;
  record: PostureRecord;
  buckets: MinuteBucket[];
}
export interface RecordQuery {
  owner: string;
  from: string;
  to: string;
  mode?: RecordMode;
  offset?: number;
}
export interface RecordPage {
  counts: Record<string, number>;
  records: PostureRecord[];
  hasMore: boolean;
}
export interface RecordDetail {
  record: PostureRecord;
  buckets: MinuteBucket[];
}
export interface StatisticsRow extends Totals {
  date: string;
  hour: string;
  mode: RecordMode;
  scorePolicyVersion: string;
  habitPolicyVersion: string;
  longestContinuousMs: number;
  sessionCount: number;
  recordIds: string[];
}
export type RecordsResult<T> = { ok: true; value: T } | { ok: false; error: string };
export interface RecordsApi {
  onClosing(listener: () => Promise<boolean>): () => void;
  generation(owner: string): Promise<RecordsResult<number>>;
  write(batch: RecordBatch): Promise<RecordsResult<void>>;
  list(query: RecordQuery): Promise<RecordsResult<RecordPage>>;
  detail(owner: string, id: string): Promise<RecordsResult<RecordDetail>>;
  statistics(query: RecordQuery): Promise<RecordsResult<StatisticsRow[]>>;
  clear(owner: string): Promise<RecordsResult<number>>;
}
export const emptyTotals = (): Totals => ({ runMs: 0, validMs: 0, scoreTimeSum: 0, deviationMs: 0, deviationEpisodeCount: 0 });
export const averageScore = (totals: Pick<Totals, 'validMs' | 'scoreTimeSum'>) => totals.validMs > 0 ? totals.scoreTimeSum / totals.validMs : null;
export function localDateKey(epoch: number, offsetMinutes: number) {
  return new Date(epoch - offsetMinutes * 60_000).toISOString().slice(0, 10);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('기록 형식이 올바르지 않습니다.');
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !(key in value))) throw new Error('지원하지 않는 기록 필드입니다.');
}
export function recordText(value: unknown, max = 120): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || [...value].some(char => char.charCodeAt(0) < 32)) throw new Error('기록 식별자가 올바르지 않습니다.');
  return value;
}
function number(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw new Error('기록 수치가 올바르지 않습니다.');
  return value;
}
function integer(value: unknown) {
  const result = number(value);
  if (!Number.isSafeInteger(result)) throw new Error('기록 순번이 올바르지 않습니다.');
  return result;
}
const totalKeys = ['runMs', 'validMs', 'scoreTimeSum', 'deviationMs', 'deviationEpisodeCount'];
function totals(value: Record<string, unknown>): Totals {
  const result = Object.fromEntries(totalKeys.map(key => [key, number(value[key])])) as unknown as Totals;
  integer(result.deviationEpisodeCount);
  if (result.validMs > result.runMs + 0.01 || result.deviationMs > result.validMs + 0.01 || result.scoreTimeSum > result.validMs * 100 + 0.01) throw new Error('관측 시간과 점수 합계가 일치하지 않습니다.');
  return result;
}
export function parseRecord(value: unknown): PostureRecord {
  const row = object(value);
  exact(row, [...totalKeys, 'id', 'owner', 'mode', 'startedAt', 'updatedAt', 'offsetMinutes', 'scorePolicyVersion', 'habitPolicyVersion', 'longestContinuousMs', 'status']);
  const mode = row.mode;
  const status = row.status;
  if (mode !== 'turtle' && mode !== 'shoulder') throw new Error('지원하지 않는 기록 모드입니다.');
  if (status !== 'running' && status !== 'finished' && status !== 'interrupted') throw new Error('기록 상태가 올바르지 않습니다.');
  const startedAt = number(row.startedAt, 8e12);
  const updatedAt = number(row.updatedAt, 8e12);
  const offsetMinutes = row.offsetMinutes;
  if (typeof offsetMinutes !== 'number' || !Number.isInteger(offsetMinutes) || Math.abs(offsetMinutes) > 840) throw new Error('시간대가 올바르지 않습니다.');
  const result: PostureRecord = { ...totals(row), id: recordText(row.id), owner: recordText(row.owner), mode, status,
    startedAt, updatedAt, offsetMinutes, scorePolicyVersion: recordText(row.scorePolicyVersion), habitPolicyVersion: recordText(row.habitPolicyVersion), longestContinuousMs: number(row.longestContinuousMs) };
  if (updatedAt < startedAt || Math.abs(updatedAt - startedAt - result.runMs) > 0.01 || result.longestContinuousMs > result.validMs + 0.01) throw new Error('기록 시간 범위가 일치하지 않습니다.');
  return result;
}
export function parseBatch(value: unknown): RecordBatch {
  const row = object(value);
  exact(row, ['schemaVersion', 'aggregationPolicyVersion', 'generation', 'sequence', 'record', 'buckets']);
  if (row.schemaVersion !== RECORD_VERSION || row.aggregationPolicyVersion !== AGGREGATION_VERSION) throw new Error('지원하지 않는 기록 버전입니다.');
  if (!Array.isArray(row.buckets) || row.buckets.length > 120) throw new Error('한 번에 저장할 기록이 너무 많습니다.');
  const record = parseRecord(row.record);
  const buckets = row.buckets.map(value => {
    const bucket = object(value);
    exact(bucket, [...totalKeys, 'minute']);
    const minute = integer(bucket.minute);
    if (minute % 60_000 !== 0 || minute + 60_000 <= record.startedAt || minute > record.updatedAt) throw new Error('시간 버킷 범위가 올바르지 않습니다.');
    const result = { ...totals(bucket), minute };
    if (result.runMs > 60_000.01) throw new Error('시간 버킷이 1분을 초과했습니다.');
    return result;
  });
  if (new Set(buckets.map(bucket => bucket.minute)).size !== buckets.length) throw new Error('중복 시간 버킷입니다.');
  return { schemaVersion: 1, aggregationPolicyVersion: AGGREGATION_VERSION, generation: integer(row.generation), sequence: integer(row.sequence), record, buckets };
}
export function parseQuery(value: unknown): RecordQuery {
  const row = object(value);
  if (Object.keys(row).some(key => !['owner', 'from', 'to', 'mode', 'offset'].includes(key))) throw new Error('지원하지 않는 조회 조건입니다.');
  const from = recordText(row.from, 10), to = recordText(row.to, 10);
  for (const date of [from, to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('날짜가 올바르지 않습니다.');
  }
  if (from > to || Date.parse(to) - Date.parse(from) > 366 * 86400_000) throw new Error('조회 기간은 최대 1년입니다.');
  if (row.mode !== undefined && row.mode !== 'turtle' && row.mode !== 'shoulder') throw new Error('지원하지 않는 조회 모드입니다.');
  return { owner: recordText(row.owner), from, to, mode: row.mode as RecordMode | undefined, offset: row.offset === undefined ? 0 : integer(row.offset) };
}
