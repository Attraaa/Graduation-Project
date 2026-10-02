import type { RecordsApi, RecordsResult } from '../../../../database/contracts.ts';
import { apiRequest } from '../../utils/apiClient';

/** Electron only signals window closing so pending batches can flush to the server first. */
declare global { interface Window { motiRecords?: { onClosing(listener: () => Promise<boolean>): () => void } } }

const call = async <T>(request: () => Promise<T>): Promise<RecordsResult<T>> => {
  try { return { ok: true, value: await request() }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : '기록 요청에 실패했습니다.' }; }
};
// The server takes the owner from the login token, so it is not sent.
const search = ({ from, to, mode, offset }: { from: string; to: string; mode?: string; offset?: number }) => '?' + new URLSearchParams({
  from, to, ...(mode ? { mode } : {}), ...(offset ? { offset: String(offset) } : {}),
});
const path = (id: string) => encodeURIComponent(id);

const serverRecords: RecordsApi = {
  generation: () => call(async () => (await apiRequest<{ generation: number }>('/api/records/generation')).generation),
  write: batch => call(() => apiRequest<void>('/api/records/posture', { method: 'POST', body: batch })),
  list: query => call(() => apiRequest('/api/records/posture' + search(query))),
  detail: (_owner, id) => call(() => apiRequest('/api/records/posture/' + path(id))),
  statistics: query => call(() => apiRequest('/api/records/posture-statistics' + search({ from: query.from, to: query.to, mode: query.mode }))),
  clear: () => call(async () => (await apiRequest<{ generation: number }>('/api/records', { method: 'DELETE' })).generation),
  writeKeyboard: batch => call(() => apiRequest<void>('/api/records/keyboard', { method: 'POST', body: batch })),
  keyboardStatistics: ({ from, to }) => call(() => apiRequest('/api/records/keyboard' + search({ from, to }))),
  keyboardDetail: (_owner, id) => call(() => apiRequest('/api/records/keyboard/' + path(id))),
};

export function recordsApi(): RecordsApi {
  return serverRecords;
}
export async function recordValue<T>(promise: Promise<RecordsResult<T>>) {
  const result = await promise;
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
