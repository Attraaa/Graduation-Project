import { apiRequest } from '../../utils/apiClient';
import type { AiReview, AiReviewInput } from './input';

type LegacyReview = Pick<AiReview, 'strengths' | 'model' | 'generatedAt' | 'adviceSource'> & {
  summary: string;
  improvements: string[];
};

export async function requestAiReview(input: AiReviewInput, signal?: AbortSignal): Promise<AiReview> {
  const review = await apiRequest<AiReview | LegacyReview>('/api/ai/review', { method: 'POST', body: input, timeoutMs: 105_000, signal });
  if ('sections' in review) return review;

  const { summary, improvements, ...shared } = review;
  return {
    ...shared,
    headline: '',
    sections: [{ key: 'overall', title: `최근 ${input.days}일 총평`, text: summary }],
    weaknesses: improvements,
    goals: [],
    caution: null,
  };
}
