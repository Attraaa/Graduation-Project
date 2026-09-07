import { Router } from 'express';
import type { Pool } from 'mysql2/promise';
import { hashPassword, comparePassword, type Auth } from '../auth.js';
import { asyncHandler, HttpError } from '../http.js';
import { bodyObject, text, password } from '../validation.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

interface UserRow extends RowDataPacket {
  id: number;
  username: string;
  nickname: string;
  email: string | null;
  password_hash: string;
}

export function createAuthRouter(pool: Pool, auth: Auth) {
  const router = Router();

  router.post('/register', asyncHandler(async (req, res) => {
    const input = bodyObject(req.body);
    const username = text(input.username, '아이디', 50);
    const nickname = text(input.nickname, '닉네임', 100);
    const plain = password(input.password);
    const email = input.email === undefined || input.email === null || input.email === ''
      ? null : text(input.email, '이메일', 255);
    const [rows] = await pool.query<UserRow[]>('SELECT id FROM users WHERE username = ?', [username]);
    if (rows.length > 0) throw new HttpError(409, '이미 사용 중인 아이디입니다.');
    const hash = await hashPassword(plain);
    try {
      await pool.query<ResultSetHeader>(
        'INSERT INTO users (username, nickname, email, password_hash) VALUES (?, ?, ?, ?)',
        [username, nickname, email, hash],
      );
    } catch (error) {
      // The unique DB constraint also covers simultaneous registrations for the same username.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY') {
        throw new HttpError(409, '이미 사용 중인 아이디입니다.');
      }
      throw error;
    }
    res.status(201).json({ message: '회원가입이 완료되었습니다. 로그인해 주세요.' });
  }));

  router.post('/login', asyncHandler(async (req, res) => {
    const input = bodyObject(req.body);
    const username = text(input.username, '아이디', 50);
    // Permit old passwords at login; the byte limit applies when creating a new hash.
    const plain = text(input.password, '비밀번호', 4096, false);
    const [rows] = await pool.query<UserRow[]>(
      'SELECT id, username, nickname, password_hash FROM users WHERE username = ?', [username],
    );
    const user = rows[0];
    if (!user || !(await comparePassword(plain, user.password_hash))) {
      throw new HttpError(401, '아이디 또는 비밀번호를 확인해 주세요.');
    }
    const token = auth.signToken({ userId: user.id, username: user.username });
    res.json({ token, user: { id: user.id, username: user.username, nickname: user.nickname } });
  }));

  router.get('/me', auth.requireAuth, asyncHandler(async (req, res) => {
    const [rows] = await pool.query<UserRow[]>(
      'SELECT id, username, nickname, email FROM users WHERE id = ?', [req.user!.userId],
    );
    if (!rows[0]) throw new HttpError(404, '사용자를 찾을 수 없습니다.');
    res.json(rows[0]);
  }));

  router.put('/me', auth.requireAuth, asyncHandler(async (req, res) => {
    const nickname = text(bodyObject(req.body).nickname, '닉네임', 100);
    const [result] = await pool.query<ResultSetHeader>(
      'UPDATE users SET nickname = ? WHERE id = ?', [nickname, req.user!.userId],
    );
    if (!result.affectedRows) throw new HttpError(404, '사용자를 찾을 수 없습니다.');
    res.json({ message: '닉네임이 변경되었습니다.' });
  }));

  router.put('/me/password', auth.requireAuth, asyncHandler(async (req, res) => {
    const input = bodyObject(req.body);
    const currentPassword = text(input.currentPassword, '현재 비밀번호', 4096, false);
    const newPassword = password(input.newPassword, '새 비밀번호');
    const [rows] = await pool.query<UserRow[]>(
      'SELECT password_hash FROM users WHERE id = ?', [req.user!.userId],
    );
    if (!rows[0] || !(await comparePassword(currentPassword, rows[0].password_hash))) {
      throw new HttpError(401, '현재 비밀번호를 확인해 주세요.');
    }
    const hash = await hashPassword(newPassword);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user!.userId]);
    res.json({ message: '비밀번호가 변경되었습니다.' });
  }));

  router.get('/check/:username', asyncHandler(async (req, res) => {
    const username = text(req.params.username, '아이디', 50);
    const [rows] = await pool.query<UserRow[]>('SELECT id FROM users WHERE username = ?', [username]);
    res.json({ exists: rows.length > 0 });
  }));

  return router;
}
