import { randomUUID } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { rmSync, renameSync } from 'node:fs'
import { net, safeStorage } from 'electron'
import type { IpcMain, IpcMainInvokeEvent, IpcMainEvent } from 'electron'
import type { BrowserSession, DesktopApiCall, DesktopApiReply, DesktopSession, SessionUser } from '../src/utils/desktopApiContract'

type PrivateSession = BrowserSession & { revision: string }

const PUBLIC_ROUTES = {
  GET: /^\/api\/auth\/check\/[^/]+$/,
  POST: /^\/api\/auth\/(?:login|register|email-verification|find-id|password-reset(?:\/verify|\/confirm)?)$/,
}
const ACCOUNT_ROUTES = {
  GET: /^\/api\/(?:auth\/me|records\/(?:generation|history|posture|posture-statistics|eye-statistics|keyboard|(?:posture|eye|keyboard)\/[^/]+))$/,
  POST: /^\/api\/(?:records\/(?:posture|eye|keyboard)|ai\/review|hospitals)$/,
  PUT: /^\/api\/auth\/me(?:\/email)?$/,
  DELETE: /^\/api\/records$/,
}

function route(base: URL, path: string, method: string) {
  if (path.length > 4096 || /[\s#\\]/.test(path)) throw new Error('잘못된 API 주소입니다.')
  const prefix = base.pathname.replace(/\/+$/, '')
  const pathname = path.split('?')[0]
  const url = new URL(base.origin + prefix + path)
  if (url.pathname !== prefix + pathname || url.origin !== base.origin) throw new Error('잘못된 API 주소입니다.')
  if (PUBLIC_ROUTES[method as keyof typeof PUBLIC_ROUTES]?.test(pathname) === true) return { url, privateRoute: false }
  if (ACCOUNT_ROUTES[method as keyof typeof ACCOUNT_ROUTES]?.test(pathname) === true) return { url, privateRoute: true }
  throw new Error('지원하지 않는 API 요청입니다.')
}

function userFrom(value: unknown): SessionUser | null {
  if (!value || typeof value !== 'object') return null
  const { id, username, nickname } = value as SessionUser
  if (!/^\d+$/.test(String(id)) || typeof username !== 'string' || typeof nickname !== 'string') return null
  return { id: String(id), username, nickname }
}

function sessionFrom(data: unknown, revision: string): PrivateSession | null {
  if (!data || typeof data !== 'object') return null
  const { token, user: value } = data as BrowserSession
  const user = userFrom(value)
  if (!user || typeof token !== 'string' || !token || token.length > 8192 || /\s/.test(token)) return null
  return { token, user, revision }
}

const publicSession = ({ user, revision }: PrivateSession): DesktopSession => ({ user, revision })
const changedSession = () => new Error('로그인 상태가 바뀌었어요. 현재 계정에서 다시 시도해 주세요.')

/** Only the first-party main frame can ask for known API calls. The Bearer token stays in main. */
export function registerDesktopApi(ipc: IpcMain, trusted: (event: IpcMainInvokeEvent | IpcMainEvent) => void, apiBase: string, file: string) {
  const base = URL.canParse(apiBase) ? new URL(apiBase) : null
  let session: PrivateSession | null = null
  let initialized: Promise<void> | undefined
  const active = new Map<string, AbortController>()

  const assertRevision = (revision: string | null) => {
    if ((session?.revision ?? null) !== revision) throw changedSession()
  }

  const store = async (next: PrivateSession, revision: string | null, signal?: AbortSignal) => {
    const temp = `${file}.${randomUUID()}.tmp`
    try {
      try {
        if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('secure storage is unavailable')
        const encrypted = await safeStorage.encryptStringAsync(JSON.stringify(next))
        await writeFile(temp, encrypted, { flag: 'wx', mode: 0o600 })
      } catch { throw new Error('이 기기의 보안 저장소에 로그인 정보를 저장할 수 없어요.') }
      signal?.throwIfAborted()
      assertRevision(revision)
      // Publishing the file and identity together prevents a late login from replacing a newer account.
      try { renameSync(temp, file) } catch { throw new Error('이 기기의 보안 저장소에 로그인 정보를 저장할 수 없어요.') }
      session = next
    } catch (error) {
      await rm(temp, { force: true }).catch(() => {})
      throw error
    }
  }

  const initialize = async (legacy: unknown) => {
    try {
      if (await safeStorage.isAsyncEncryptionAvailable()) {
        const decoded = await safeStorage.decryptStringAsync(await readFile(file))
        session = sessionFrom(JSON.parse(decoded.result), randomUUID())
        if (session && decoded.shouldReEncrypt) await store(session, session.revision)
      }
    } catch { /* An absent or unreadable local session can be recovered by signing in. */ }
    const previous = sessionFrom(legacy, randomUUID())
    if (!session && previous) await store(previous, null).catch(() => {})
  }

  ipc.handle('moti-api:initialize', async (event, legacy: unknown) => {
    trusted(event)
    initialized ??= initialize(legacy)
    await initialized
    return session ? publicSession(session) : null
  })
  ipc.handle('moti-api:logout', async (event, revision: string) => {
    trusted(event)
    await initialized
    assertRevision(revision)
    if (!session) return
    try { rmSync(file, { force: true }) } catch { throw new Error('이 기기의 보안 저장소에서 로그인 정보를 지울 수 없어요.') }
    session = null
  })
  ipc.on('moti-api:cancel', (event, id: unknown) => {
    try { trusted(event) } catch { return }
    if (typeof id === 'string') active.get(id)?.abort()
  })

  ipc.handle('moti-api:request', async (event, call: DesktopApiCall): Promise<DesktopApiReply> => {
    trusted(event)
    if (!base || !/^https?:$/.test(base.protocol) || base.username || base.password || base.hash || base.search) throw new Error('API 서버 주소를 확인해 주세요.')
    if (!call || typeof call.path !== 'string' || typeof call.method !== 'string' || !/^[-\da-f]{36}$/.test(call.id)
      || (call.body !== undefined && (typeof call.body !== 'string' || call.body.length > 1024 * 1024))
      || !['GET', 'POST', 'PUT', 'DELETE'].includes(call.method)
      || !Number.isSafeInteger(call.timeoutMs) || call.timeoutMs < 1 || call.timeoutMs > 120_000 || active.has(call.id)) {
      throw new Error('잘못된 API 요청입니다.')
    }
    const { url, privateRoute } = route(base, call.path, call.method)
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(call.timeoutMs)])
    active.set(call.id, controller)
    try {
      await initialized
      signal.throwIfAborted()
      assertRevision(call.revision)
      if (privateRoute && !session) return { status: 401, data: { message: '로그인이 필요합니다.' } }
      const response = await net.fetch(url.href, {
        method: call.method, redirect: 'error', credentials: 'omit', body: call.body, signal,
        headers: { ...(call.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(privateRoute && session ? { Authorization: `Bearer ${session.token}` } : {}) },
      }).catch(() => { throw new Error('서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.') })
      const data = response.status === 204 ? null : await response.json().catch(() => null)
      signal.throwIfAborted()
      assertRevision(call.revision)
      if (url.pathname.endsWith('/api/auth/login')) {
        if (!response.ok) return { status: response.status, data: { message: (data as { message?: unknown } | null)?.message } }
        const next = sessionFrom(data, randomUUID())
        if (!next) throw new Error('로그인 응답을 확인할 수 없습니다.')
        await store(next, call.revision, signal)
        return { status: response.status, data: publicSession(next) }
      }
      if (response.ok && session && call.method === 'PUT' && url.pathname.endsWith('/api/auth/me')) {
        const { nickname } = JSON.parse(call.body ?? '{}') as { nickname?: unknown }
        if (typeof nickname === 'string') await store({ ...session, user: { ...session.user, nickname: nickname.trim() } }, call.revision, signal)
      }
      return { status: response.status, data }
    } finally { active.delete(call.id) }
  })

  return () => { for (const controller of active.values()) controller.abort() }
}
