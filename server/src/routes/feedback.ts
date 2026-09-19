import { Router } from 'express';
import type { Pool } from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { Auth } from '../auth.js';
import { asyncHandler, HttpError } from '../http.js';
import { bodyObject, dateParam, optional, text } from '../validation.js';
import { parseMode } from '../services/sessions.js';

/**
 * feedback 테이블은 세션이 아니라 (사용자, 날짜, 모드)에 붙습니다. 하루치 요약을 남기는 자리이며
 * 서버가 요약을 만들지는 않습니다. 저장된 문장은 저장한 쪽이 쓴 것입니다.
 */
export function createFeedbackRouter(pool: Pool, auth: Auth) {
  const router = Router();
  router.use(auth.requireAuth);

  router.post('/', asyncHandler(async (req, res) => {
    const input = bodyObject(req.body);
    const date = dateParam(input.date);
    if (!date) throw new HttpError(400, '날짜는 YYYY-MM-DD 형식으로 보내 주세요.');
    const mode = optional(input.mode, parseMode);
    const feedbackText = text(input.feedbackText, '피드백 내용', 2000);
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO feedback (user_id, date, mode, feedback_text) VALUES (?, ?, ?, ?)',
      [req.user!.userId, date, mode, feedbackText],
    );
    res.status(201).json({ id: result.insertId });
  }));

  router.get('/', asyncHandler(async (req, res) => {
    const date = dateParam(req.query.date);
    const mode = optional(req.query.mode, parseMode);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, DATE_FORMAT(date, '%Y-%m-%d') AS date, mode, feedback_text, created_at
       FROM feedback
       WHERE user_id = ?
         AND (? IS NULL OR date = ?)
         AND (? IS NULL OR mode = ?)
       ORDER BY date DESC, created_at DESC
       LIMIT 30`,
      [req.user!.userId, date ?? null, date ?? null, mode, mode],
    );
    res.json(rows);
  }));

  return router;
}
