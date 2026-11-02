import { createHash, randomInt } from 'node:crypto';
import { Router } from 'express';
import type { Pool } from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { hashPassword } from '../auth.js';
import { asyncHandler, HttpError } from '../http.js';
import type { Mailer, MailMessage } from '../services/mail.js';
import { bodyObject, email, password, text } from '../validation.js';

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_MS = 60_000;
const NOT_REQUESTED = '직접 요청하지 않았다면 이 메일은 무시해도 됩니다.';
const EXPIRED = '인증 코드가 만료되었거나 입력 횟수를 넘었습니다. 인증 코드를 다시 받아 주세요.';
const WRONG_CODE = '인증 코드가 맞지 않습니다.';

// Only a hash is stored. The user ID is part of it, so a code cannot be used for another account.
const codeHash = (userId: number, code: string) => createHash('sha256').update(`${userId}:${code}`).digest('hex');

/**
 * 아이디 찾기·비밀번호 재설정. 가입한 이메일로만 알려 주고, 응답으로는 계정이 있는지 드러내지 않습니다.
 * mailer가 없으면(서버에 SMTP 설정 없음) 메일을 보내는 두 경로가 503으로 알려 줍니다.
 */
export function createRecoveryRouter(pool: Pool, mailer: Mailer | null) {
  const router = Router();
  // One mail per typed address (or ID and address) per minute, whether or not it matched an account (kept in memory).
  const lastSent = new Map<string, number>();

  const requireMailer = () => {
    if (!mailer) throw new HttpError(503, '메일 발송이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.');
    return mailer;
  };
  const throttle = (key: string) => {
    const now = Date.now();
    for (const [other, at] of lastSent) if (now - at >= RESEND_MS) lastSent.delete(other);
    if (lastSent.has(key)) throw new HttpError(429, '방금 메일을 보냈습니다. 1분 뒤에 다시 시도해 주세요.');
    lastSent.set(key, now);
  };
  const send = async (mail: Mailer, key: string, message: MailMessage) => {
    try {
      await mail(message);
    } catch (error) {
      lastSent.delete(key);
      console.error(error);
      throw new HttpError(502, '메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };
  const readCode = (input: Record<string, unknown>) => {
    const username = text(input.username, '아이디', 50);
    const code = text(input.code, '인증 코드', 6);
    if (!/^\d{6}$/.test(code)) throw new HttpError(400, '인증 코드는 6자리 숫자입니다.');
    return { username, code };
  };
  /** Resolves to the user whose live code may now be compared, after spending one of its attempts. */
  const startAttempt = async (username: string) => {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE username = ?', [username]);
    const user = rows[0] as { id: number } | undefined;
    if (!user) throw new HttpError(400, EXPIRED);
    // Spent before the comparison, so parallel guesses cannot exceed the limit.
    const [spent] = await pool.query<ResultSetHeader>(
      'UPDATE password_reset_codes SET attempts = attempts + 1 WHERE user_id = ? AND attempts < ? AND expires_at > NOW()',
      [user.id, MAX_ATTEMPTS],
    );
    if (spent.affectedRows !== 1) throw new HttpError(400, EXPIRED);
    return user.id;
  };

  router.post('/find-id', asyncHandler(async (req, res) => {
    const mail = requireMailer();
    const address = email(bodyObject(req.body).email);
    const key = `id:${address}`;
    throttle(key);
    const [rows] = await pool.query<RowDataPacket[]>('SELECT username FROM users WHERE email = ? ORDER BY id', [address]);
    if (rows.length) {
      await send(mail, key, {
        to: address,
        subject: '[Moti] 아이디 안내',
        text: `이 이메일로 가입한 Moti 아이디입니다.\n\n${rows.map(row => `- ${row.username}`).join('\n')}\n\n`
          + `비밀번호가 기억나지 않으면 로그인 화면의 '비밀번호 찾기'를 이용해 주세요.\n${NOT_REQUESTED}`,
      });
    }
    res.json({ message: '입력한 이메일로 가입한 아이디가 있으면 메일로 보냈습니다. 메일함을 확인해 주세요.' });
  }));

  router.post('/password-reset', asyncHandler(async (req, res) => {
    const mail = requireMailer();
    const input = bodyObject(req.body);
    const username = text(input.username, '아이디', 50);
    const address = email(input.email);
    const key = `reset:${username}:${address}`;
    throttle(key);
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE username = ? AND email = ?', [username, address]);
    const user = rows[0] as { id: number } | undefined;
    if (user) {
      const code = String(randomInt(1_000_000)).padStart(6, '0');
      // A new request replaces the previous code and its attempts.
      await pool.query(
        `INSERT INTO password_reset_codes (user_id, code_hash, expires_at, attempts)
         VALUES (?, ?, NOW() + INTERVAL ${CODE_MINUTES} MINUTE, 0) AS next
         ON DUPLICATE KEY UPDATE code_hash = next.code_hash, expires_at = next.expires_at, attempts = 0`,
        [user.id, codeHash(user.id, code)],
      );
      await send(mail, key, {
        to: address,
        subject: '[Moti] 비밀번호 재설정 인증 코드',
        text: `Moti 비밀번호 재설정 인증 코드: ${code}\n\n로그인 화면의 '비밀번호 찾기'에 ${CODE_MINUTES}분 안에 입력해 주세요.\n`
          + `${NOT_REQUESTED} 비밀번호는 바뀌지 않습니다.`,
      });
    }
    res.json({ message: `아이디와 이메일이 맞으면 인증 코드를 메일로 보냈습니다. ${CODE_MINUTES}분 안에 입력해 주세요.` });
  }));

  // Checks the code before the screen asks for a new password. The code stays valid for the confirmation,
  // and a right code gives its attempt back so checking first does not use up the limit.
  router.post('/password-reset/verify', asyncHandler(async (req, res) => {
    const { username, code } = readCode(bodyObject(req.body));
    const userId = await startAttempt(username);
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT user_id FROM password_reset_codes WHERE user_id = ? AND code_hash = ?', [userId, codeHash(userId, code)],
    );
    if (!rows.length) throw new HttpError(400, WRONG_CODE);
    await pool.query('UPDATE password_reset_codes SET attempts = attempts - 1 WHERE user_id = ? AND attempts > 0', [userId]);
    res.json({ message: '인증되었습니다. 새 비밀번호를 입력해 주세요.' });
  }));

  router.post('/password-reset/confirm', asyncHandler(async (req, res) => {
    const input = bodyObject(req.body);
    const { username, code } = readCode(input);
    const newPassword = password(input.newPassword, '새 비밀번호');
    const userId = await startAttempt(username);
    const [used] = await pool.query<ResultSetHeader>(
      'DELETE FROM password_reset_codes WHERE user_id = ? AND code_hash = ?', [userId, codeHash(userId, code)],
    );
    if (!used.affectedRows) throw new HttpError(400, WRONG_CODE);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(newPassword), userId]);
    res.json({ message: '비밀번호를 재설정했습니다. 새 비밀번호로 로그인해 주세요.' });
  }));

  return router;
}
