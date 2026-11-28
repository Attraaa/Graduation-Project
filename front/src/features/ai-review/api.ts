import type { DailyReviewInput } from '../../../../database/localReview.ts';
import { apiRequest } from '../../utils/apiClient';
import type { AiReview } from './input';

export function requestAiReview(input: DailyReviewInput, signal?: AbortSignal): Promise<AiReview> {
  return apiRequest<AiReview>('/api/ai/review', { method: 'POST', body: input, timeoutMs: 105_000, signal });
}
