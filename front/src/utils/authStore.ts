import { apiRequest, clearSession, readSession, writeSession } from './apiClient';
import type { SessionUser } from './apiClient';

export type CurrentUser = SessionUser;
type Result = { ok: boolean; message: string };
const failure = (error: unknown): Result => ({ ok: false, message: error instanceof Error ? error.message : '요청을 처리하지 못했습니다.' });

/** id is the server user ID as a string; records use it as their owner. username is the login ID. */
export const getCurrentUser = (): CurrentUser | null => readSession()?.user ?? null;

export const isDuplicateId = async (username: string) =>
  (await apiRequest<{ exists: boolean }>(`/api/auth/check/${encodeURIComponent(username.trim())}`)).exists;

export const registerUser = async (user: { username: string; nickname: string; email: string; password: string }): Promise<Result> => {
  try {
    const { message } = await apiRequest<{ message: string }>('/api/auth/register', { method: 'POST', body: user });
    return { ok: true, message };
  } catch (error) { return failure(error); }
};

export const loginUser = async (username: string, password: string): Promise<Result> => {
  try {
    const { token, user } = await apiRequest<{ token: string; user: { id: number; username: string; nickname: string } }>(
      '/api/auth/login', { method: 'POST', body: { username: username.trim(), password } });
    writeSession({ token, user: { id: String(user.id), username: user.username, nickname: user.nickname } });
    return { ok: true, message: '로그인되었습니다.' };
  } catch (error) { return failure(error); }
};

export const logoutUser = () => clearSession();

/**
 * Logs out only after running measurements have stopped and their last batches are saved with the current token.
 * If that save fails, confirmUnsaved decides: false keeps the login (and the retry button), true drops the unsaved records.
 */
export const logoutAfterSaving = async (confirmUnsaved: () => Promise<boolean>) => {
  const owner = getCurrentUser()?.id;
  const { discardUnsavedRecordings, stopAndSaveRecordings } = await import('../features/records/recording');
  try {
    await stopAndSaveRecordings();
  } catch {
    if (!await confirmUnsaved()) return false;
    if (owner) discardUnsavedRecordings(owner);
  }
  logoutUser();
  return true;
};

export const updateCurrentUser = async (nickname: string): Promise<Result> => {
  const session = readSession();
  if (!session) return { ok: false, message: '로그인이 필요합니다.' };
  try {
    const { message } = await apiRequest<{ message: string }>('/api/auth/me', { method: 'PUT', body: { nickname } });
    writeSession({ ...session, user: { ...session.user, nickname: nickname.trim() } });
    return { ok: true, message };
  } catch (error) { return failure(error); }
};

export const changePassword = async (currentPassword: string, newPassword: string): Promise<Result> => {
  try {
    const { message } = await apiRequest<{ message: string }>('/api/auth/me/password', { method: 'PUT', body: { currentPassword, newPassword } });
    return { ok: true, message };
  } catch (error) { return failure(error); }
};

const messageRequest = async (path: string, method: string, body: unknown, timeoutMs?: number): Promise<Result> => {
  try {
    const { message } = await apiRequest<{ message: string }>(path, { method, body, timeoutMs });
    return { ok: true, message };
  } catch (error) { return failure(error); }
};
// The server waits for the mail server before answering, which can take longer than the default 15 seconds.
const MAIL_TIMEOUT_MS = 30_000;

/** Mails the IDs registered to this address. The answer is the same whether or not one exists. */
export const findId = (email: string) => messageRequest('/api/auth/find-id', 'POST', { email: email.trim() }, MAIL_TIMEOUT_MS);

/** Mails a 6-digit code when the ID and its registered address match. The answer is the same either way. */
export const requestPasswordReset = (username: string, email: string) =>
  messageRequest('/api/auth/password-reset', 'POST', { username: username.trim(), email: email.trim() }, MAIL_TIMEOUT_MS);

export const resetPassword = (username: string, code: string, newPassword: string) =>
  messageRequest('/api/auth/password-reset/confirm', 'POST', { username: username.trim(), code: code.trim(), newPassword });

/** The recovery address can reset the password, so changing it needs the current password. */
export const changeEmail = (email: string, currentPassword: string) =>
  messageRequest('/api/auth/me/email', 'PUT', { email: email.trim(), currentPassword });

/** The registered recovery address, or null when the account has none. */
export const readAccountEmail = async () => (await apiRequest<{ email: string | null }>('/api/auth/me')).email || null;

export const clearStatistics = async () => {
  const owner = getCurrentUser()?.id;
  if (!owner) throw new Error('로그인이 필요합니다.');
  const { recordsApi, recordValue } = await import('../features/records/api');
  const { discardDeletedRecordings } = await import('../features/records/recording');
  await recordValue(recordsApi().clear(owner));
  discardDeletedRecordings(owner);
};
