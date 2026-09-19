import { Router } from 'express';
import type { Pool } from 'mysql2/promise';
import type { Auth } from '../auth.js';
import { asyncHandler, HttpError } from '../http.js';
import { bodyObject, dateParam, sessionId } from '../validation.js';
import { MysqlSessionRepository } from '../repositories/sessions.js';
import {
  appendKeystrokeEvents, appendSessionLog, appendSessionLogs, endSession, parseCalibrationReference,
  parseKeystrokeEvents, parseMode, parseSessionEnd, parseSessionLog, parseSessionLogs,
  saveCalibrationReference,
} from '../services/sessions.js';

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

  // 세션당 한 번만 저장합니다. 기준을 다시 잡는 것은 새 세션입니다.
  router.post('/:id/calibration', asyncHandler(async (req, res) => {
    const id = sessionId(req.params.id);
    const reference = parseCalibrationReference(req.body);
    await saveCalibrationReference(repository, req.user!.userId, id, reference);
    res.status(201).json({ message: '기준 자세를 저장했습니다.' });
  }));

  router.post('/:id/logs', asyncHandler(async (req, res) => {
    const id = sessionId(req.params.id);
    const log = parseSessionLog(req.body);
    await appendSessionLog(repository, req.user!.userId, id, log);
    res.status(201).json({ message: 'ok' });
  }));

  // 200ms 간격 관측을 한 건씩 보내면 한 시간에 수천 번 왕복합니다. 모아서 한 번에 넣습니다.
  router.post('/:id/logs/batch', asyncHandler(async (req, res) => {
    const id = sessionId(req.params.id);
    const logs = parseSessionLogs(req.body);
    await appendSessionLogs(repository, req.user!.userId, id, logs);
    res.status(201).json({ saved: logs.length });
  }));

  router.post('/:id/keystrokes', asyncHandler(async (req, res) => {
    const id = sessionId(req.params.id);
    const events = parseKeystrokeEvents(req.body);
    await appendKeystrokeEvents(repository, req.user!.userId, id, events);
    res.status(201).json({ saved: events.length });
  }));

  return router;
}
