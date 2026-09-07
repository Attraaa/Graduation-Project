import type { NextFunction, Request, Response, RequestHandler } from 'express';
import type { AuthRequest } from './auth.js';

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

// Express 4 does not forward rejected async handlers to error middleware itself.
export function asyncHandler(handler: (req: AuthRequest, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => { void Promise.resolve().then(() => handler(req, res)).catch(next); };
}

export function handleError(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) { next(error); return; }
  if (error instanceof HttpError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  if (error instanceof SyntaxError && 'type' in error && error.type === 'entity.parse.failed') {
    res.status(400).json({ message: '올바른 JSON 요청이 필요합니다.' });
    return;
  }
  if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
    res.status(413).json({ message: '요청 본문이 너무 큽니다.' });
    return;
  }
  console.error(error);
  res.status(500).json({ message: '서버 오류가 발생했습니다.' });
}
