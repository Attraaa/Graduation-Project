import { createHash, randomInt } from 'node:crypto';
import { Router } from 'express';
import type { Pool, PoolConnection } from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { hashPassword } from '../auth.js';
import { asyncHandler, HttpError } from '../http.js';
import type { Mailer, MailMessage } from '../services/mail.js';
import { bodyObject, email, password, sixDigitCode, text } from '../validation.js';
import { enforce, limit, memoryRequestLimits, type RequestLimits } from '../services/requestLimits.js';
import { VerificationRejected, verifyInTransaction } from '../services/verificationTransaction.js';

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const NOT_REQUESTED = '직접 요청하지 않았다면 이 메일은 무시해도 됩니다.';
const EXPIRED = '인증 코드가 만료되었거나 입력 횟수를 넘었습니다. 인증 코드를 다시 받아 주세요.';
const WRONG_CODE = '인증 코드가 맞지 않습니다.';

const newCode = () => String(randomInt(1_000_000)).padStart(6, '0');
// Only a hash is stored. The user ID is part of it, so a code cannot be used for another account.
const codeHash = (userId: number, code: string) => createHash('sha256').update(`${userId}:${code}`).digest('hex');
// Likewise the address is part of an email code's hash, so it proves only the address it was mailed to.
const emailCodeHash = (address: string, code: string) => createHash('sha256').update(`${address}:${code}`).digest('hex');

/**
 * Spends one attempt at the code mailed by POST /email-verification and deletes the code when it matches.
 * Registration and email changes call it right before saving the address.
 */
export async function spendEmailCode(connection: PoolConnection, address: string, code: string) {
  // Spent before the comparison, so parallel guesses cannot exceed the limit.
  const [spent] = await connection.query<ResultSetHeader>(
    'UPDATE email_verification_codes SET attempts = attempts + 1 WHERE email = ? AND attempts < ? AND expires_at > NOW()',
    [address, MAX_ATTEMPTS],
  );
  if (spent.affectedRows !== 1) throw new VerificationRejected(EXPIRED);
  const [used] = await connection.query<ResultSetHeader>(
    'DELETE FROM email_verification_codes WHERE email = ? AND code_hash = ?', [address, emailCodeHash(address, code)],
  );
  if (!used.affectedRows) throw new VerificationRejected(WRONG_CODE);
}

/**
 * 이메일 인증·아이디 찾기·비밀번호 재설정. 찾기는 가입한 이메일로만 알려 주고, 응답으로는 계정이 있는지 드러내지 않습니다.
 * mailer가 없으면(서버에 SMTP 설정 없음) 메일을 보내는 세 경로가 503으로 알려 주고, 그래서 가입과 이메일 변경도 할 수 없습니다.
 */
export function createRecoveryRouter(pool: Pool, mailer: Mailer | null, limits: RequestLimits = memoryRequestLimits()) {
  const router = Router();

  const requireMailer = () => {
    if (!mailer) throw new HttpError(503, '메일 발송이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.');
    return mailer;
  };
  const throttle = (kind: string, address: string, ip: string | undefined, username?: string) => enforce(limits, [
    limit(`mail:${kind}:${username?.normalize('NFKC').toLowerCase() ?? ''}:${address}`, 1, 60),
    limit(`mail:address:${address}`, 8, 3600),
    limit(`mail:ip:${ip}`, 30, 3600),
    limit('mail:total', 300, 3600),
    ...(username ? [limit(`mail:account:${username.normalize('NFKC').toLowerCase()}`, 5, 3600)] : []),
  ], '메일 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.');
  const send = (mail: Mailer, message: MailMessage) => {
    void Promise.resolve().then(() => mail(message)).catch(() => { console.error('Recovery email delivery failed'); });
  };
  const readCode = (input: Record<string, unknown>) => {
    const username = text(input.username, '아이디', 50);
    return { username, code: sixDigitCode(input.code) };
  };
  /** Resolves to the user whose live code may now be compared, after spending one of its attempts. */
  const startAttempt = async (connection: PoolConnection, username: string) => {
    const [rows] = await connection.query<RowDataPacket[]>('SELECT id FROM users WHERE username = ?', [username]);
    const user = rows[0] as { id: number } | undefined;
    if (!user) throw new VerificationRejected(EXPIRED);
    // Spent before the comparison, so parallel guesses cannot exceed the limit.
    const [spent] = await connection.query<ResultSetHeader>(
      'UPDATE password_reset_codes SET attempts = attempts + 1 WHERE user_id = ? AND attempts < ? AND expires_at > NOW()',
      [user.id, MAX_ATTEMPTS],
    );
    if (spent.affectedRows !== 1) throw new VerificationRejected(EXPIRED);
    return user.id;
  };

  // The address is not saved yet, so any address may ask. The code is what proves it belongs to the person registering it.
  router.post('/email-verification', asyncHandler(async (req, res) => {
    const mail = requireMailer();
    const address = email(bodyObject(req.body).email);
    await throttle('verify', address, req.ip);
    const code = newCode();
    // Codes for addresses that were never used are cleared here, so the table holds only live codes.
    await pool.query('DELETE FROM email_verification_codes WHERE expires_at <= NOW()');
    // A new request replaces the previous code and its attempts.
    await pool.query(
      `INSERT INTO email_verification_codes (email, code_hash, expires_at, attempts)
       VALUES (?, ?, NOW() + INTERVAL ${CODE_MINUTES} MINUTE, 0) AS next
       ON DUPLICATE KEY UPDATE code_hash = next.code_hash, expires_at = next.expires_at, attempts = 0`,
      [address, emailCodeHash(address, code)],
    );
    try { await mail({
      to: address,
      subject: '[Moti] 이메일 인증 코드',
      text: `Moti 이메일 인증 코드: ${code}\n\n코드를 요청한 Moti 화면에 ${CODE_MINUTES}분 안에 입력해 주세요.\n${NOT_REQUESTED}`,
    }); } catch { throw new HttpError(502, '메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
    res.json({ message: `인증 코드를 메일로 보냈습니다. ${CODE_MINUTES}분 안에 입력해 주세요.` });
  }));

  router.post('/find-id', asyncHandler(async (req, res) => {
    const mail = requireMailer();
    const address = email(bodyObject(req.body).email);
    await throttle('id', address, req.ip);
    const [rows] = await pool.query<RowDataPacket[]>('SELECT username FROM users WHERE email = ? ORDER BY id', [address]);
    if (rows.length) {
      send(mail, {
        to: address,
        subject: '[Moti] 아이디 안내',
        text: `이 이메일로 가입한 Moti 아이디입니다.\n\n${rows.map(row => `- ${row.username}`).join('\n')}\n\n`
          + `비밀번호가 기억나지 않으면 로그인 화면의 '비밀번호 재설정'을 이용해 주세요.\n${NOT_REQUESTED}`,
      });
    }
    res.json({ message: '입력한 이메일로 가입한 아이디가 있으면 메일로 보냈습니다. 메일함을 확인해 주세요.' });
  }));

  router.post('/password-reset', asyncHandler(async (req, res) => {
    const mail = requireMailer();
    const input = bodyObject(req.body);
    const username = text(input.username, '아이디', 50);
    const address = email(input.email);
    await throttle('reset', address, req.ip, username);
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE username = ? AND email = ?', [username, address]);
    const user = rows[0] as { id: number } | undefined;
    if (user) {
      const code = newCode();
      // A new request replaces the previous code and its attempts.
      await pool.query(
        `INSERT INTO password_reset_codes (user_id, code_hash, expires_at, attempts)
         VALUES (?, ?, NOW() + INTERVAL ${CODE_MINUTES} MINUTE, 0) AS next
         ON DUPLICATE KEY UPDATE code_hash = next.code_hash, expires_at = next.expires_at, attempts = 0`,
        [user.id, codeHash(user.id, code)],
      );
      send(mail, {
        to: address,
        subject: '[Moti] 비밀번호 재설정 인증 코드',
        text: `Moti 비밀번호 재설정 인증 코드: ${code}\n\n코드를 요청한 Moti 화면에 ${CODE_MINUTES}분 안에 입력해 주세요.\n`
          + `${NOT_REQUESTED} 비밀번호는 바뀌지 않습니다.`,
      });
    }
    res.json({ message: `아이디와 이메일이 맞으면 인증 코드를 메일로 보냈습니다. ${CODE_MINUTES}분 안에 입력해 주세요.` });
  }));

  // Checks the code before the screen asks for a new password. The code stays valid for the confirmation,
  // and a right code gives its attempt back so checking first does not use up the limit.
  router.post('/password-reset/verify', asyncHandler(async (req, res) => {
    const { username, code } = readCode(bodyObject(req.body));
    await verifyInTransaction(pool, async connection => {
      const userId = await startAttempt(connection, username);
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT user_id FROM password_reset_codes WHERE user_id = ? AND code_hash = ?', [userId, codeHash(userId, code)],
      );
      if (!rows.length) throw new VerificationRejected(WRONG_CODE);
      await connection.query('UPDATE password_reset_codes SET attempts = attempts - 1 WHERE user_id = ? AND attempts > 0', [userId]);
    });
    res.json({ message: '인증되었습니다. 새 비밀번호를 입력해 주세요.' });
  }));

  router.post('/password-reset/confirm', asyncHandler(async (req, res) => {
    const input = bodyObject(req.body);
    const { username, code } = readCode(input);
    const newPassword = password(input.newPassword, '새 비밀번호');
    await verifyInTransaction(pool, async connection => {
      const userId = await startAttempt(connection, username);
      const [used] = await connection.query<ResultSetHeader>(
        'DELETE FROM password_reset_codes WHERE user_id = ? AND code_hash = ?', [userId, codeHash(userId, code)],
      );
      if (!used.affectedRows) throw new VerificationRejected(WRONG_CODE);
      const [updated] = await connection.query<ResultSetHeader>('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?',
        [await hashPassword(newPassword), userId]);
      if (!updated.affectedRows) throw new HttpError(409, '계정이 바뀌었어요. 다시 시도해 주세요.');
    });
    res.json({ message: '비밀번호를 재설정했습니다. 새 비밀번호로 로그인해 주세요.' });
  }));

  return router;
}
