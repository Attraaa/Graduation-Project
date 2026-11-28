import type { ReviewRequest } from '../../../../database/localReview.ts';
import { apiRequest } from '../../utils/apiClient';
import type { AiReview } from './input';

const REVIEW_TIMEOUT_MS = 105_000;

export function requestAiReview(input: ReviewRequest, signal?: AbortSignal): Promise<AiReview> {
  if (import.meta.env.DEV && import.meta.env.MOTI_DAILY_REVIEW_TEST) {
    return requestLocalReview(input, signal);
  }
  return apiRequest<AiReview>('/api/ai/review', { method: 'POST', body: input, timeoutMs: REVIEW_TIMEOUT_MS, signal });
}

async function requestLocalReview(input: ReviewRequest, signal?: AbortSignal): Promise<AiReview> {
  // The development proxy supplies a test credential and keeps the AWS login token out of the request.
  const timeout = AbortSignal.timeout(REVIEW_TIMEOUT_MS);
  const response = await fetch('/__moti_daily_review', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.sections) {
    throw new Error(typeof data?.message === 'string' ? data.message : '이 PC의 하루당 총평 테스트 서버에 연결하지 못했어요.');
  }
  return data;
}
