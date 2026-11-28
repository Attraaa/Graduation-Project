import { localDateKey } from '../../../../database/contracts.ts';
import type { EyeDetail } from '../../../../database/eye.ts';
import { ApiHttpError, apiRequest, readSession } from '../../utils/apiClient';
import type { LocalEyeSession } from '../records/localReviewResults';
import type { EyeReviewRow } from './input';

type Totals = Pick<EyeReviewRow, 'validMs' | 'blinks'>;
type Synced = { totals: Totals; finished: boolean };

const sum = (rows: Totals[]): Totals => rows.reduce((a, b) => ({
  validMs: a.validMs + b.validMs, blinks: a.blinks + b.blinks,
}), { validMs: 0, blinks: 0 });

export async function loadDailyEye(owner: string, date: string, local: LocalEyeSession[], signal: AbortSignal): Promise<EyeReviewRow[]> {
  const session = readSession();
  if (!session || session.user.id !== owner) throw new Error('기록의 계정과 현재 로그인 계정이 달라요.');
  const query = new URLSearchParams({ from: date, to: date });
  const loadCloud = () => apiRequest<EyeReviewRow[]>(`/api/records/eye-statistics?${query}`, { session, signal });
  if (!local.length) return loadCloud();
  const byId = new Map(local.map(row => [row.id, sum(row.rows.filter(bucket => bucket.date === date))]));
  const loadDetail = async (id: string): Promise<Synced> => {
    const detail = await apiRequest<EyeDetail>(`/api/records/eye/${encodeURIComponent(id)}`, { session, signal }).catch(error => {
      if (error instanceof ApiHttpError && error.status === 404) return null;
      throw error;
    });
    const buckets = detail?.buckets.filter(bucket => localDateKey(bucket.minute, detail.record.offsetMinutes) === date) ?? [];
    return { totals: sum(buckets), finished: !!detail && detail.record.status !== 'running' };
  };
  const loadDetails = async (ids: string[]) => {
    const result = new Map<string, Synced>();
    for (let start = 0; start < ids.length; start += 8) {
      const batch = await Promise.all(ids.slice(start, start + 8).map(async id => [id, await loadDetail(id)] as const));
      for (const [id, detail] of batch) result.set(id, detail);
    }
    return result;
  };
  const loadDay = async () => {
    try { return await loadCloud(); }
    catch (error) {
      signal.throwIfAborted();
      if (error instanceof ApiHttpError && error.status < 500) throw error;
      return null;
    }
  };
  const deviceOnly = () => [{ date, ...sum([...byId.values()]) }];
  let before: Map<string, Synced>;
  try { before = await loadDetails([...byId.keys()]); }
  catch (error) {
    if (await loadDay() === null) return deviceOnly();
    throw error;
  }
  // A completed local session may be uploading when the aggregate is read.
  // Re-read only unfinished/missing cloud details before adding any local remainder.
  for (let attempt = 0; attempt < 2; attempt++) {
    const cloud = await loadDay();
    if (!cloud) return deviceOnly();
    const pending = [...before].filter(([, detail]) => !detail.finished).map(([id]) => id);
    const after = await loadDetails(pending);
    const changed = [...after].some(([id, detail]) => {
      const old = before.get(id)!.totals;
      return detail.totals.validMs !== old.validMs || detail.totals.blinks !== old.blinks;
    });
    if (!changed) {
      const totals = sum(cloud.filter(row => row.date === date));
      for (const [id, device] of byId) {
        const synced = before.get(id)!.totals;
        totals.validMs += Math.max(0, device.validMs - synced.validMs);
        totals.blinks += Math.max(0, device.blinks - synced.blinks);
      }
      return [{ date, ...totals }];
    }
    for (const [id, detail] of after) before.set(id, detail);
  }
  throw new Error('안구 기록을 저장하는 중이에요. 잠시 후 다시 시도해 주세요.');
}
