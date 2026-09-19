import type { RecordsApi, RecordsResult } from '../../../../database/contracts.ts';

declare global { interface Window { motiRecords?: RecordsApi } }

export function recordsApi(): RecordsApi {
  if (!window.motiRecords) throw new Error('기록 저장과 조회는 Moti 데스크톱 앱에서 사용할 수 있습니다.');
  return window.motiRecords;
}
export async function recordValue<T>(promise: Promise<RecordsResult<T>>) {
  const result = await promise;
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
