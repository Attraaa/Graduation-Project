import { Router } from 'express';
import type { Pool } from 'mysql2/promise';
import type { Auth } from '../auth.js';
import { asyncHandler, HttpError } from '../http.js';
import { bodyObject, dateParam, sessionId } from '../validation.js';
import { MysqlSessionRepository } from '../repositories/sessions.js';
import { appendSessionLog, endSession, parseMode, parseSessionEnd, parseSessionLog } from '../services/sessions.js';

export function createSessionsRouter(pool: Pool, auth: Auth) {
  const router = Router();
  const repository = new MysqlSessionRepository(pool);
  router.use(auth.requireAuth);

  router.post('/', asyncHandler(async (req, res) => {
    const mode = parseMode(bodyObject(req.body).mode);
    res.status(201).json(await repository.start(req.user!.userId, mode));
  }));

  router.patch('/:id/end', asyncHandler(async (req, res) => {
    const id = sessionId(req.params.id);
    const result = parseSessionEnd(req.body);
    await endSession(repository, req.user!.userId, id, result);
    res.json({ message: '세션이 종료되었습니다.' });
  }));

  router.get('/', asyncHandler(async (req, res) => {
    res.json(await repository.list(req.user!.userId, dateParam(req.query.date)));
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const session = await repository.detail(req.user!.userId, sessionId(req.params.id));
    if (!session) throw new HttpError(404, '세션을 찾을 수 없습니다.');
    res.json(session);
  }));

  router.post('/:id/logs', asyncHandler(async (req, res) => {
    const id = sessionId(req.params.id);
    const log = parseSessionLog(req.body);
    await appendSessionLog(repository, req.user!.userId, id, log);
    res.status(201).json({ message: 'ok' });
  }));

  return router;
}
