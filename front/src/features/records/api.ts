import type { RecordsApi, RecordsResult } from '../../../../database/contracts.ts';
import { apiRequest, readSession } from '../../utils/apiClient';

import type { PostureTimelineBatch } from './postureTimelineContract';
import type { DailyTimelineSession, ReviewSession } from './reviewSession';
declare global { interface Window { motiRecords?: {
  writePostureTimeline(batch: PostureTimelineBatch): Promise<void>;
  readPostureSummaries(owner: string, from: number, to: number): Promise<ReviewSession[]>;
  readPostureDay(owner: string, from: number, to: number): Promise<DailyTimelineSession[]>;
  clearPostureTimelines(owner: string): Promise<void>;
  onClosing(listener: () => Promise<boolean>): () => void } } }

const call = async <T>(request: () => Promise<T>): Promise<RecordsResult<T>> => {
  try { return { ok: true, value: await request() }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : '기록 요청에 실패했습니다.' }; }
};
// The server takes the owner from the login token, so it is not sent.
const search = ({ from, to, mode, offset }: { from: string; to: string; mode?: string; offset?: number }) => '?' + new URLSearchParams({
  from, to, ...(mode ? { mode } : {}), ...(offset ? { offset: String(offset) } : {}),
});
const path = (id: string) => encodeURIComponent(id);
const keyboardQualityOwners = new Set<string>();
function request<T>(owner: string, url: string, options?: { method: string; body?: unknown }) {
  const session = readSession();
  if (!session || session.user.id !== owner) throw new Error('기록의 계정과 현재 로그인 계정이 달라요.');
  return apiRequest<T>(url, { ...options, session });
}

const serverRecords: RecordsApi = {
  generation: owner => call(async () => {
    const response = await request<{ generation: number; keyboardInputQuality?: boolean }>(owner, '/api/records/generation');
    if (response.keyboardInputQuality) keyboardQualityOwners.add(owner); else keyboardQualityOwners.delete(owner);
    return response.generation;
  }),
  write: batch => call(() => request<void>(batch.record.owner, '/api/records/posture', { method: 'POST', body: batch })),
  list: query => call(() => request(query.owner, '/api/records/posture' + search(query))),
  detail: (owner, id) => call(() => request(owner, '/api/records/posture/' + path(id))),
  statistics: query => call(() => request(query.owner, '/api/records/posture-statistics' + search(query))),
  clear: owner => call(async () => (await request<{ generation: number }>(owner, '/api/records', { method: 'DELETE' })).generation),
  writeKeyboard: batch => call(() => {
    const { quality, ...legacyRecord } = batch.record;
    const body = quality && !keyboardQualityOwners.has(batch.record.owner) ? { ...batch, record: legacyRecord } : batch;
    return request<void>(batch.record.owner, '/api/records/keyboard', { method: 'POST', body });
  }),
  keyboardStatistics: query => call(() => request(query.owner, '/api/records/keyboard' + search(query))),
  keyboardDetail: (owner, id) => call(() => request(owner, '/api/records/keyboard/' + path(id))),
  writeEye: batch => call(() => request<void>(batch.record.owner, '/api/records/eye', { method: 'POST', body: batch })),
  eyeStatistics: query => call(() => request(query.owner, '/api/records/eye-statistics' + search(query))),
  eyeDetail: (owner, id) => call(() => request(owner, '/api/records/eye/' + path(id))),
  history: query => call(() => request(query.owner, '/api/records/history' + search(query))),
};

export function recordsApi(): RecordsApi {
  return serverRecords;
}
export async function recordValue<T>(promise: Promise<RecordsResult<T>>) {
  const result = await promise;
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
