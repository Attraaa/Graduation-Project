/**
 * Moti API server client. The base URL is fixed at build time by VITE_MOTI_API_URL
 * (front/.env, overridable in front/.env.local). Desktop authenticates in Electron main.
 */
import { systemIssue } from '../features/notifications/issues';
import type { BrowserSession, DesktopSession } from './desktopApiContract';
export type { SessionUser } from './desktopApiContract';

const API_URL = String(import.meta.env?.VITE_MOTI_API_URL ?? '').replace(/\/+$/, '');
const SESSION_KEY = 'moti.session';
const SESSION_CHANGED = 'moti-session-changed';

export type Session = BrowserSession | DesktopSession;
let desktopSession: DesktopSession | null = null;
const desktop = () => typeof window === 'undefined' ? undefined : window.motiApi;

function readBrowserSession(): BrowserSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as BrowserSession | null;
    return typeof value?.token === 'string' && typeof value.user?.id === 'string' ? value : null;
  } catch { return null; }
}
export async function initializeDesktopSession() {
  const api = desktop();
  if (!api) return;
  const legacy = readBrowserSession();
  try { localStorage.removeItem(SESSION_KEY); } catch { /* The desktop app can still use encrypted storage. */ }
  desktopSession = await api.initialize(legacy).catch(() => null);
}
export const readSession = (): Session | null => desktop() ? desktopSession : readBrowserSession();
const identity = (session: Session | null) => session ? session.revision ?? session.token : null;
export const currentSessionIdentity = () => identity(readSession());
export const isCurrentSession = (session: Session) => {
  const current = readSession();
  return !!current && current.user.id === session.user.id && current.token === session.token && identity(current) === identity(session);
};
export function subscribeSession(listener: () => void) {
  const onStorage = (event: StorageEvent) => { if (!desktop() && (event.key === SESSION_KEY || event.key === null)) listener(); };
  window.addEventListener(SESSION_CHANGED, listener);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(SESSION_CHANGED, listener); window.removeEventListener('storage', onStorage); };
}
export function writeSession(session: Session) {
  if (desktop()) {
    if (session.token || !session.revision) throw new Error('데스크톱 로그인 응답을 확인할 수 없어요.');
    desktopSession = { user: session.user, revision: session.revision };
  } else {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
    catch { throw new Error('로그인 상태를 저장할 수 없어요. 이 앱의 사이트 데이터 저장을 허용한 뒤 다시 로그인해 주세요.'); }
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_CHANGED));
}
export async function clearSession(expected = readSession()) {
  if (expected && !isCurrentSession(expected)) return;
  const api = desktop();
  if (api) {
    if (!expected?.revision) return;
    await api.logout(expected.revision);
    if (!isCurrentSession(expected)) return;
    desktopSession = null;
  } else {
    try { localStorage.removeItem(SESSION_KEY); }
    catch { throw new Error('로그인 상태를 지울 수 없어요. 이 앱의 사이트 데이터 저장 설정을 확인해 주세요.'); }
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_CHANGED));
}

export async function apiRequest<T>(path: string, options: { method?: string; body?: unknown; timeoutMs?: number; signal?: AbortSignal; session?: Session } = {}): Promise<T> {
  const session = options.session ?? readSession();
  const checkSession = () => {
    if (session && !isCurrentSession(session)) throw new Error('로그인 상태가 바뀌었어요. 현재 계정에서 다시 시도해 주세요.');
  };
  checkSession();
  const method = options.method ?? 'GET';
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  const timeoutMs = options.timeoutMs ?? 15_000;
  const api = desktop();
  let status: number;
  let data: unknown;
  if (api) {
    const id = crypto.randomUUID();
    const cancel = () => api.cancel(id);
    options.signal?.throwIfAborted();
    options.signal?.addEventListener('abort', cancel, { once: true });
    try {
      const reply = await api.request({ id, path, method, body, timeoutMs, revision: session?.revision ?? null });
      ({ status, data } = reply);
    } catch (error) {
      options.signal?.throwIfAborted();
      const message = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '서버 요청을 처리할 수 없어요.';
      throw new Error(message, { cause: error });
    } finally { options.signal?.removeEventListener('abort', cancel); }
  } else {
    let response: Response;
    try {
      response = await fetch(API_URL + path, {
        method, redirect: 'error', body,
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
        signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(options.signal ? [options.signal] : [])]),
      });
    } catch {
      throw new Error('서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.');
    }
    options.signal?.throwIfAborted();
    checkSession();
    status = response.status;
    if (status !== 204 && (status !== 401 || !session)) data = await response.json().catch(() => null);
  }
  options.signal?.throwIfAborted();
  checkSession();
  if (status === 401 && session && path !== '/api/auth/login') {
    // An expired or revoked token cannot recover by retrying; return to the login screen.
    await clearSession(session);
    if (readSession()) throw new Error('로그인 상태가 바뀌었어요. 현재 계정에서 다시 시도해 주세요.');
    systemIssue('auth', 'expired', 'auth');
    if (typeof window !== 'undefined' && window.location) window.location.hash = '#/login';
    throw new Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
  }
  if (status === 204) return undefined as T;
  const message = (data as { message?: unknown } | null)?.message;
  if (status < 200 || status >= 300) throw new Error(typeof message === 'string' ? message : `서버 요청에 실패했습니다. (${status})`);
  return data as T;
}
