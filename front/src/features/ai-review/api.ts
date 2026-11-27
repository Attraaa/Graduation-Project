import { apiRequest } from '../../utils/apiClient';
import type { AiReview, AiReviewInput } from './input';

export const requestAiReview = (input: AiReviewInput, signal?: AbortSignal) =>
  apiRequest<AiReview>('/api/ai/review', { method: 'POST', body: input, timeoutMs: 105_000, signal });
