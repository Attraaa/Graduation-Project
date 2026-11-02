import { Router } from 'express';
import type { Auth } from '../auth.js';
import { asyncHandler, HttpError } from '../http.js';
import { parseReviewInput, type Reviewer } from '../services/aiReview.js';

const HOURLY_LIMIT = 10;
const HOUR_MS = 3_600_000;

/**
 * AI 총평. reviewer가 없으면(서버에 ANTHROPIC_API_KEY 없음) 503으로 알려 줍니다.
 * 만든 총평은 저장하지 않고 요청한 화면에만 돌려줍니다.
 */
export function createAiRouter(reviewer: Reviewer | null, auth: Auth) {
  const router = Router();
  // Every review spends the server's API key, so one account gets a few per hour (kept in memory).
  const recent = new Map<number, number[]>();
  router.use(auth.requireAuth);

  router.post('/review', asyncHandler(async (req, res) => {
    if (!reviewer) throw new HttpError(503, 'AI 총평이 아직 설정되지 않았어요. 서버의 server/.env에 ANTHROPIC_API_KEY를 넣어 주세요.');
    const input = parseReviewInput(req.body);
    const now = Date.now(), userId = req.user!.userId;
    const times = (recent.get(userId) ?? []).filter(at => now - at < HOUR_MS);
    if (times.length >= HOURLY_LIMIT) {
      throw new HttpError(429, `AI 총평은 한 시간에 ${HOURLY_LIMIT}번까지 받을 수 있어요. 잠시 후 다시 시도해 주세요.`);
    }
    recent.set(userId, [...times, now]);
    res.json({ ...await reviewer(input), generatedAt: new Date(now).toISOString() });
  }));

  return router;
}
