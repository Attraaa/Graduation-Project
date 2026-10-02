import { Router } from 'express';
import type { Request } from 'express';
import type { Auth, AuthRequest } from '../auth.js';
import { asyncHandler, HttpError } from '../http.js';
import type { MysqlRecordRepository } from '../repositories/records.js';
import { parseBatch, parseQuery, recordText } from '../../../database/contracts.ts';
import { parseKeyboardBatch, parseKeyboardQuery } from '../../../database/keyboard.ts';

type RecordStore = Pick<MysqlRecordRepository, keyof MysqlRecordRepository>;

/** Shared contract validators throw plain errors; those are client input errors here. */
function parse<T>(read: () => T): T {
  try { return read(); } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : '기록 요청이 올바르지 않습니다.');
  }
}

/** The owner always comes from the token. Query strings only choose the date range and mode. */
function query(req: Request, owner: string, keys: readonly string[]) {
  const input: Record<string, unknown> = { owner };
  for (const [key, value] of Object.entries(req.query)) {
    if (!keys.includes(key) || typeof value !== 'string') throw new HttpError(400, '지원하지 않는 조회 조건입니다.');
    input[key] = key === 'offset' ? (/^\d{1,9}$/.test(value) ? Number(value) : -1) : value;
  }
  return input;
}

export function createRecordsRouter(repository: RecordStore, auth: Auth) {
  const router = Router();
  router.use(auth.requireAuth);
  const owner = (req: AuthRequest) => String(req.user!.userId);
  const ownBatch = (req: AuthRequest, batchOwner: string) => {
    if (batchOwner !== owner(req)) throw new HttpError(403, '다른 계정의 기록은 저장할 수 없습니다.');
  };

  router.get('/generation', asyncHandler(async (req, res) => {
    res.json({ generation: await repository.generation(req.user!.userId) });
  }));

  router.delete('/', asyncHandler(async (req, res) => {
    res.json({ generation: await repository.clear(req.user!.userId) });
  }));

  router.post('/posture', asyncHandler(async (req, res) => {
    const batch = parse(() => parseBatch(req.body));
    ownBatch(req, batch.record.owner);
    await repository.write(req.user!.userId, batch);
    res.status(204).end();
  }));

  router.get('/posture', asyncHandler(async (req, res) => {
    const input = parse(() => parseQuery(query(req, owner(req), ['from', 'to', 'mode', 'offset'])));
    res.json(await repository.list(req.user!.userId, input));
  }));

  router.get('/posture-statistics', asyncHandler(async (req, res) => {
    const input = parse(() => parseQuery(query(req, owner(req), ['from', 'to', 'mode'])));
    res.json(await repository.statistics(req.user!.userId, input));
  }));

  router.get('/posture/:id', asyncHandler(async (req, res) => {
    const id = parse(() => recordText(req.params.id));
    res.json(await repository.detail(req.user!.userId, id));
  }));

  router.post('/keyboard', asyncHandler(async (req, res) => {
    const batch = parse(() => parseKeyboardBatch(req.body));
    ownBatch(req, batch.record.owner);
    await repository.writeKeyboard(req.user!.userId, batch);
    res.status(204).end();
  }));

  router.get('/keyboard', asyncHandler(async (req, res) => {
    const input = parse(() => parseKeyboardQuery(query(req, owner(req), ['from', 'to'])));
    res.json(await repository.keyboardStatistics(req.user!.userId, input));
  }));

  router.get('/keyboard/:id', asyncHandler(async (req, res) => {
    const id = parse(() => recordText(req.params.id));
    res.json(await repository.keyboardDetail(req.user!.userId, id));
  }));

  return router;
}
