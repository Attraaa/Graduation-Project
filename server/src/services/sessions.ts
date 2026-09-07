import { HttpError } from '../http.js';
import { bodyObject, integer } from '../validation.js';

export const SESSION_MODES = ['turtle', 'shoulder', 'keyboard', 'eye'] as const;
export type SessionMode = typeof SESSION_MODES[number];
export interface Session {
  id: number;
  user_id: number;
  ended_at: Date | string | null;
}
export interface SessionEnd { score: number; alertCount: number }
export interface SessionLog { status: 'GOOD' | 'WARNING' | 'DANGER'; measuredValue: number | null }

export interface SessionTransaction {
  findOwnedForUpdate(id: number, userId: number): Promise<Session | null>;
  finish(id: number, result: SessionEnd): Promise<void>;
  aggregate(id: number, userId: number): Promise<void>;
  appendLog(id: number, userId: number, log: SessionLog): Promise<void>;
}
export interface SessionRepository {
  transaction<T>(work: (transaction: SessionTransaction) => Promise<T>): Promise<T>;
}

export function parseMode(value: unknown): SessionMode {
  if (!SESSION_MODES.includes(value as SessionMode)) throw new HttpError(400, '지원하지 않는 측정 모드입니다.');
  return value as SessionMode;
}

export function parseSessionEnd(value: unknown): SessionEnd {
  const input = bodyObject(value);
  // Legacy storage contract only. The future measurement score formula is not defined here.
  return {
    score: integer(input.score, 'score', 0, 100),
    alertCount: integer(input.alertCount, 'alertCount', 0, 2147483647),
  };
}

export function parseSessionLog(value: unknown): SessionLog {
  const input = bodyObject(value);
  if (input.status !== 'GOOD' && input.status !== 'WARNING' && input.status !== 'DANGER') {
    throw new HttpError(400, 'status는 GOOD, WARNING, DANGER 중 하나여야 합니다.');
  }
  const measuredValue = input.measuredValue ?? null;
  if (measuredValue !== null && (typeof measuredValue !== 'number' || !Number.isFinite(measuredValue) || Math.abs(measuredValue) > 3.402823466e38)) {
    throw new HttpError(400, 'measuredValue는 유한한 FLOAT 범위의 숫자여야 합니다.');
  }
  return { status: input.status, measuredValue };
}

export async function endSession(repository: SessionRepository, userId: number, id: number, result: SessionEnd): Promise<void> {
  await repository.transaction(async (transaction) => {
    const session = await transaction.findOwnedForUpdate(id, userId);
    if (!session) throw new HttpError(404, '세션을 찾을 수 없습니다.');
    // The row lock serializes end/log requests. Retries never replace the first result or add statistics twice.
    if (session.ended_at !== null) return;
    await transaction.finish(id, result);
    await transaction.aggregate(id, userId);
  });
}

export async function appendSessionLog(repository: SessionRepository, userId: number, id: number, log: SessionLog): Promise<void> {
  await repository.transaction(async (transaction) => {
    const session = await transaction.findOwnedForUpdate(id, userId);
    if (!session) throw new HttpError(404, '세션을 찾을 수 없습니다.');
    if (session.ended_at !== null) throw new HttpError(409, '종료된 세션에는 로그를 추가할 수 없습니다.');
    await transaction.appendLog(id, userId, log);
  });
}
