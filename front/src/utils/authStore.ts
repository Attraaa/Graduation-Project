import { apiRequest, clearSession, currentSessionIdentity, isCurrentSession, readSession, writeSession } from './apiClient';
import type { Session, SessionUser } from './apiClient';
import type { DesktopSession } from './desktopApiContract';
import { lockRecordingDeletion } from '../features/records/deletion';
import { recordsChanged } from '../features/records/refresh';

export type CurrentUser = SessionUser;
type Result = { ok: boolean; message: string };
const failure = (error: unknown): Result => ({ ok: false, message: error instanceof Error ? error.message : '요청을 처리하지 못했습니다.' });

/** id is the server user ID as a string; records use it as their owner. username is the login ID. */
export const getCurrentUser = (): CurrentUser | null => readSession()?.user ?? null;

export const isDuplicateId = async (username: string) =>
  (await apiRequest<{ exists: boolean }>(`/api/auth/check/${encodeURIComponent(username.trim())}`)).exists;

/** code is the one mailed to the email by requestEmailCode. */
export const registerUser = async (user: { username: string; nickname: string; email: string; code: string; password: string }, signal?: AbortSignal): Promise<Result> => {
  try {
    const { message } = await apiRequest<{ message: string }>('/api/auth/register', { method: 'POST', body: user, signal });
    return { ok: true, message };
  } catch (error) { return failure(error); }
};

export const loginUser = async (username: string, password: string, signal?: AbortSignal): Promise<Result> => {
  const previous = currentSessionIdentity();
  try {
    const reply = await apiRequest<DesktopSession | { token: string; user: { id: number; username: string; nickname: string } }>(
      '/api/auth/login', { method: 'POST', body: { username: username.trim(), password }, signal });
    signal?.throwIfAborted();
    if (currentSessionIdentity() !== previous) throw new Error('로그인 상태가 바뀌었어요. 다시 시도해 주세요.');
    if ('revision' in reply) writeSession(reply);
    else writeSession({ token: reply.token, revision: crypto.randomUUID(), user: { ...reply.user, id: String(reply.user.id) } });
    return { ok: true, message: '로그인되었습니다.' };
  } catch (error) { return failure(error); }
};

export const logoutUser = () => clearSession();

/**
 * Logs out only after running measurements have stopped and their last batches are saved with the current token.
 * If that save fails, confirmUnsaved decides: false keeps the login (and the retry button), true drops the unsaved records.
 */
export const logoutAfterSaving = async (confirmUnsaved: () => Promise<boolean>) => {
  const session = readSession();
  if (!session) return true;
  const { discardUnsavedRecordings, stopAndSaveRecordings } = await import('../features/records/recording');
  if (!isCurrentSession(session)) return false;
  try {
    await stopAndSaveRecordings();
  } catch {
    if (!isCurrentSession(session) || !await confirmUnsaved() || !isCurrentSession(session)) return false;
    discardUnsavedRecordings(session.user.id);
  }
  if (!isCurrentSession(session)) return false;
  await clearSession(session);
  return true;
};

export const updateCurrentUser = async (nickname: string, signal?: AbortSignal): Promise<Result> => {
  const session = readSession();
  if (!session) return { ok: false, message: '로그인이 필요합니다.' };
  try {
    const { message } = await apiRequest<{ message: string }>('/api/auth/me', { method: 'PUT', body: { nickname }, signal, session });
    signal?.throwIfAborted();
    if (!isCurrentSession(session)) throw new Error('로그인 상태가 바뀌었어요. 다시 시도해 주세요.');
    writeSession({ ...session, user: { ...session.user, nickname: nickname.trim() } });
    return { ok: true, message };
  } catch (error) { return failure(error); }
};

const messageRequest = async (path: string, method: string, body: unknown, timeoutMs?: number): Promise<Result> => {
  try {
    const { message } = await apiRequest<{ message: string }>(path, { method, body, timeoutMs });
    return { ok: true, message };
  } catch (error) { return failure(error); }
};
// Verification codes wait for SMTP. Recovery endpoints acknowledge independently of mail delivery.
const MAIL_TIMEOUT_MS = 30_000;

/** Mails a 6-digit code to an address that is about to be registered or set as the account's address. */
export const requestEmailCode = (email: string) =>
  messageRequest('/api/auth/email-verification', 'POST', { email: email.trim() }, MAIL_TIMEOUT_MS);

/** Mails the IDs registered to this address. The answer is the same whether or not one exists. */
export const findId = (email: string) => messageRequest('/api/auth/find-id', 'POST', { email: email.trim() }, MAIL_TIMEOUT_MS);

/** Mails a 6-digit code when the ID and its registered address match. The answer is the same either way. */
export const requestPasswordReset = (username: string, email: string) =>
  messageRequest('/api/auth/password-reset', 'POST', { username: username.trim(), email: email.trim() }, MAIL_TIMEOUT_MS);

/** Checks the mailed code before the new password is asked for; the code stays valid for resetPassword. */
export const verifyResetCode = (username: string, code: string) =>
  messageRequest('/api/auth/password-reset/verify', 'POST', { username: username.trim(), code: code.trim() });

export const resetPassword = (username: string, code: string, newPassword: string) =>
  messageRequest('/api/auth/password-reset/confirm', 'POST', { username: username.trim(), code: code.trim(), newPassword });

/** The recovery address can reset the password, so changing it needs the current password and the code mailed to the new address. */
export const changeEmail = (email: string, code: string, currentPassword: string) =>
  messageRequest('/api/auth/me/email', 'PUT', { email: email.trim(), code: code.trim(), currentPassword });

/** The registered recovery address, or null when the account has none. */
export const readAccountEmail = async (signal?: AbortSignal) => (await apiRequest<{ email: string | null }>('/api/auth/me', { signal })).email || null;

export const clearStatistics = async (session: Session) => {
  if (!isCurrentSession(session)) throw new Error('확인창을 연 계정에서 다시 시도해 주세요.');
  const unlock = lockRecordingDeletion(session);
  try {
    const [{ discardDeletedRecordings }, { clearLocalPostureTimelines }, { clearLocalReviewResults }] = await Promise.all([
      import('../features/records/recording'), import('../features/records/postureTimelineRecording'), import('../features/records/localReviewResults'),
    ]);
    await apiRequest('/api/records', { method: 'DELETE', session });
    if (!isCurrentSession(session)) return;
    const owner = session.user.id;
    discardDeletedRecordings(owner);
    window.dispatchEvent(new Event('moti-stop-measurement'));
    recordsChanged();
    try { await Promise.all([clearLocalPostureTimelines(owner), clearLocalReviewResults(owner)]); }
    catch { throw new Error('서버 기록은 삭제했지만 이 기기의 기록을 모두 지우지 못했어요. 다시 시도해 주세요.'); }
  } finally { unlock(); }
};
