import { apiRequest } from '../../utils/apiClient';
import type { AiReview, AiReviewInput } from './input';

// The server waits for Claude up to 40 s per try with one retry, so the usual 15 s limit is too short here.
export const requestAiReview = (input: AiReviewInput) =>
  apiRequest<AiReview>('/api/ai/review', { method: 'POST', body: input, timeoutMs: 90_000 });
