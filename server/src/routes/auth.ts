import { Router } from 'express';
import { pool } from '../db.js';
import {
  hashPassword, comparePassword, signToken, requireAuth,
  type AuthRequest,
} from '../auth.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

interface UserRow extends RowDataPacket {
  id: number;
  username: string;
  nickname: string;
  email: string | null;
  password_hash: string;
}

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, nickname, password, email } = req.body as Record<string, string>;
  if (!username || !nickname || !password) {
    res.status(400).json({ message: '아이디, 닉네임, 비밀번호를 모두 입력해 주세요.' });
    return;
  }

  const [rows] = await pool.query<UserRow[]>(
    'SELECT id FROM users WHERE username = ?', [username],
  );
  if (rows.length > 0) {
    res.status(409).json({ message: '이미 사용 중인 아이디입니다.' });
    return;
  }

  const hash = await hashPassword(password);
  await pool.query<ResultSetHeader>(
    'INSERT INTO users (username, nickname, email, password_hash) VALUES (?, ?, ?, ?)',
    [username.trim(), nickname.trim(), email?.trim() ?? null, hash],
  );
  res.status(201).json({ message: '회원가입이 완료되었습니다. 로그인해 주세요.' });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body as Record<string, string>;
  if (!username || !password) {
    res.status(400).json({ message: '아이디와 비밀번호를 입력해 주세요.' });
    return;
  }

  const [rows] = await pool.query<UserRow[]>(
    'SELECT id, username, nickname, password_hash FROM users WHERE username = ?',
    [username.trim()],
  );
  const user = rows[0];
  if (!user || !(await comparePassword(password, user.password_hash))) {
    res.status(401).json({ message: '아이디 또는 비밀번호를 확인해 주세요.' });
    return;
  }

  const token = signToken({ userId: user.id, username: user.username });
  res.json({ token, user: { id: user.id, username: user.username, nickname: user.nickname } });
});

// GET /api/auth/me  (로그인 유지 확인)
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const [rows] = await pool.query<UserRow[]>(
    'SELECT id, username, nickname, email FROM users WHERE id = ?', [req.user!.userId],
  );
  if (!rows[0]) { res.status(404).json({ message: '사용자를 찾을 수 없습니다.' }); return; }
  res.json(rows[0]);
});

// PUT /api/auth/me  (닉네임 변경)
router.put('/me', requireAuth, async (req: AuthRequest, res) => {
  const { nickname } = req.body as { nickname: string };
  if (!nickname?.trim()) {
    res.status(400).json({ message: '닉네임을 입력해 주세요.' }); return;
  }
  await pool.query('UPDATE users SET nickname = ? WHERE id = ?', [nickname.trim(), req.user!.userId]);
  res.json({ message: '닉네임이 변경되었습니다.' });
});

// PUT /api/auth/me/password  (비밀번호 변경)
router.put('/me/password', requireAuth, async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body as Record<string, string>;
  const [rows] = await pool.query<UserRow[]>(
    'SELECT password_hash FROM users WHERE id = ?', [req.user!.userId],
  );
  if (!rows[0] || !(await comparePassword(currentPassword, rows[0].password_hash))) {
    res.status(401).json({ message: '현재 비밀번호를 확인해 주세요.' }); return;
  }
  const hash = await hashPassword(newPassword);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user!.userId]);
  res.json({ message: '비밀번호가 변경되었습니다.' });
});

// GET /api/auth/check/:username  (아이디 중복 확인 / 아이디 찾기)
router.get('/check/:username', async (req, res) => {
  const [rows] = await pool.query<UserRow[]>(
    'SELECT id FROM users WHERE username = ?', [req.params.username],
  );
  res.json({ exists: rows.length > 0 });
});

export default router;
