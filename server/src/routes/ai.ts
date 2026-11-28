import { Router } from 'express';
import { createHash } from 'node:crypto';
import type { Auth } from '../auth.js';
import { asyncHandler, HttpError } from '../http.js';
import { parseReviewInput, type Reviewer } from '../services/aiReview.js';
import { enforce, limit, memoryRequestLimits, type RequestLimits } from '../services/requestLimits.js';

const HOURLY_LIMIT = 10;

/**
 * AI 총평. 미니 PC 연결이 설정되지 않으면 503으로 알려 줍니다.
 * 만든 총평은 저장하지 않고 요청한 화면에만 돌려줍니다.
 */
export function createAiRouter(reviewer: Reviewer | null, auth: Auth, limits: RequestLimits = memoryRequestLimits()) {
  const router = Router();
  const active = new Map<string, Promise<{ generatedAt: string } & Awaited<ReturnType<Reviewer>>>>();
  router.use(auth.requireAuth);

  router.post('/review', asyncHandler(async (req, res) => {
    if (!reviewer) throw new HttpError(503, '미니 PC 총평 서버가 아직 설정되지 않았어요.');
    const input = parseReviewInput(req.body);
    const userId = req.user!.userId;
    const key = JSON.stringify([userId, input]);
    const generating = active.get(key);
    if (generating) { res.json(await generating); return; }
    const promise = (async () => {
      const hash = createHash('sha256').update(key).digest('hex');
      const unique = await limits.lease(`ai:job:${hash}`, 1, 120);
      if (!unique) throw new HttpError(429, '같은 기록의 총평을 만들고 있어요. 잠시 후 다시 시도해 주세요.', 5);
      try {
        const free = await limits.lease('ai:active', 2, 120);
        if (!free) throw new HttpError(429, 'AI 총평을 만들고 있어요. 잠시 후 다시 시도해 주세요.', 5);
        try {
          await enforce(limits, [limit(`ai:account:${userId}`, HOURLY_LIMIT, 3600), limit('ai:total', 90, 3600)],
            'AI 총평 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.');
          return { ...await reviewer(input), generatedAt: new Date().toISOString() };
        } finally { await free().catch(() => {}); }
      } finally { await unique().catch(() => {}); }
    })();
    active.set(key, promise);
    try { res.json(await promise); } finally { active.delete(key); }
  }));

  return router;
}
