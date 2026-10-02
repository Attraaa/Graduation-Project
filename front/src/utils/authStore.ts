import { apiRequest, clearSession, readSession, writeSession } from './apiClient';
import type { SessionUser } from './apiClient';

export type CurrentUser = SessionUser;
type Result = { ok: boolean; message: string };
const failure = (error: unknown): Result => ({ ok: false, message: error instanceof Error ? error.message : '요청을 처리하지 못했습니다.' });

/** id is the server user ID as a string; records use it as their owner. username is the login ID. */
export const getCurrentUser = (): CurrentUser | null => readSession()?.user ?? null;

export const isDuplicateId = async (username: string) =>
  (await apiRequest<{ exists: boolean }>(`/api/auth/check/${encodeURIComponent(username.trim())}`)).exists;

export const registerUser = async (user: { username: string; nickname: string; password: string }): Promise<Result> => {
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

export const clearStatistics = async () => {
  const owner = getCurrentUser()?.id;
  if (!owner) throw new Error('로그인이 필요합니다.');
  const { recordsApi, recordValue } = await import('../features/records/api');
  const { discardDeletedRecordings } = await import('../features/records/recording');
  await recordValue(recordsApi().clear(owner));
  discardDeletedRecordings(owner);
};
