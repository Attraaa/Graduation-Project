import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { Request, RequestHandler } from 'express';
import type { ServerConfig } from './config.js';

const SALT_ROUNDS = 10;
export const hashPassword = (plain: string) => bcrypt.hash(plain, SALT_ROUNDS);
export const comparePassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export interface JwtPayload {
  userId: number;
  username: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export function createAuth(config: ServerConfig['jwt']) {
  const signToken = (payload: JwtPayload) => jwt.sign(payload, config.secret, {
    algorithm: 'HS256', expiresIn: config.expiresIn,
  });
  const requireAuth: RequestHandler = (req: AuthRequest, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ message: '인증이 필요합니다.' });
      return;
    }
    try {
      const payload = jwt.verify(header.slice(7), config.secret, { algorithms: ['HS256'] });
      if (typeof payload === 'string' || !Number.isSafeInteger(payload.userId) || payload.userId <= 0 || typeof payload.username !== 'string') {
        throw new Error('Invalid token payload');
      }
      req.user = { userId: payload.userId, username: payload.username };
      next();
    } catch {
      res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
    }
  };
  return { signToken, requireAuth };
}

export type Auth = ReturnType<typeof createAuth>;
