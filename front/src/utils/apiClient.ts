/**
 * Moti API server client. The base URL is fixed at build time by VITE_MOTI_API_URL
 * (front/.env, overridable in front/.env.local). The login token is kept in localStorage.
 */
const API_URL = String(import.meta.env?.VITE_MOTI_API_URL ?? '').replace(/\/+$/, '');
const SESSION_KEY = 'moti.session';

export type SessionUser = { id: string; username: string; nickname: string };
type Session = { token: string; user: SessionUser };

export function readSession(): Session | null {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
    return typeof value?.token === 'string' && typeof value.user?.id === 'string' ? value : null;
  } catch { return null; }
}
export const writeSession = (session: Session) => localStorage.setItem(SESSION_KEY, JSON.stringify(session));
export const clearSession = () => localStorage.removeItem(SESSION_KEY);

export async function apiRequest<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = readSession()?.token;
  let response: Response;
  try {
    response = await fetch(API_URL + path, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.');
  }
  if (response.status === 401 && token) {
    // An expired or revoked token cannot recover by retrying; return to the login screen.
    clearSession();
    if (typeof window !== 'undefined' && window.location) window.location.hash = '#/login';
    throw new Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null) as { message?: unknown } | null;
  if (!response.ok) throw new Error(typeof data?.message === 'string' ? data.message : `서버 요청에 실패했습니다. (${response.status})`);
  return data as T;
}
