import assert from 'node:assert/strict';
import { once } from 'node:events';
import test, { type TestContext } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Pool } from 'mysql2/promise';
import { createApp } from '../src/app.js';
import { createAuth } from '../src/auth.js';
import { readConfig } from '../src/config.js';

const config = readConfig({ JWT_SECRET: 'test-only-secret-012345678901234567890' });
const token = createAuth(config.jwt).signToken({ userId: 1, username: 'tester' });

async function startApp(t: TestContext) {
  let queries = 0;
  const unavailableDatabase = {
    query: async () => { queries += 1; throw new Error('PRIVATE_DATABASE_DETAILS'); },
    getConnection: async () => { queries += 1; throw new Error('PRIVATE_DATABASE_DETAILS'); },
  } as unknown as Pool;
  const server = createApp(config, unavailableDatabase).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    queries: () => queries,
    request: (path: string, options?: RequestInit) => fetch(`${base}${path}`, {
      ...options,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...options?.headers },
      signal: AbortSignal.timeout(10000),
    }),
  };
}

test('health is liveness only and does not require a provisioned database', async (t) => {
  const app = await startApp(t);
  const response = await app.request('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  assert.equal(app.queries(), 0);
});

test('protected session and statistics routes reject missing authentication before storage', async (t) => {
  const app = await startApp(t);
  for (const path of ['/api/sessions', '/api/statistics/today', '/api/auth/me']) {
    const response = await app.request(path, { headers: { authorization: '' } });
    assert.equal(response.status, 401);
  }
  assert.equal(app.queries(), 0);
});

test('malformed inputs return 400 without reaching the database', async (t) => {
  const app = await startApp(t);
  const cases = [
    { path: '/api/sessions', method: 'POST', body: { mode: 'unknown' } },
    { path: '/api/sessions/NaN/end', method: 'PATCH', body: { score: 80, alertCount: 0 } },
    { path: '/api/sessions/1/end', method: 'PATCH', body: {} },
    { path: '/api/sessions/1/end', method: 'PATCH', body: { score: 101, alertCount: 0 } },
    { path: '/api/sessions/1/end', method: 'PATCH', body: { score: 80, alertCount: -1 } },
    { path: '/api/sessions/1/logs', method: 'POST', body: { status: 'UNKNOWN' } },
    { path: '/api/sessions/1/logs', method: 'POST', body: { status: 'GOOD', measuredValue: '90' } },
    { path: '/api/auth/register', method: 'POST', body: { username: [], nickname: 'test', password: 'a' } },
    { path: '/api/auth/register', method: 'POST', body: { username: 'test', nickname: 'test', password: '한'.repeat(25) } },
    { path: '/api/auth/me/password', method: 'PUT', body: { currentPassword: 'old' } },
  ];
  for (const request of cases) {
    const response = await app.request(request.path, { method: request.method, body: JSON.stringify(request.body) });
    assert.equal(response.status, 400, JSON.stringify(request));
  }
  for (const path of ['/api/sessions?date=2026-02-30', '/api/sessions?date[]=2026-09-06', '/api/statistics/calendar?year=2026&month=13']) {
    assert.equal((await app.request(path)).status, 400, path);
  }
  assert.equal(app.queries(), 0);
});

test('invalid JSON uses the common client error response', async (t) => {
  const app = await startApp(t);
  const response = await app.request('/api/sessions', { method: 'POST', body: '{broken' });
  assert.equal(response.status, 400);
  assert.equal(typeof (await response.json() as { message: string }).message, 'string');
  assert.equal(app.queries(), 0);
});

test('an async database failure returns a bounded 500 response without leaking details', async (t) => {
  const app = await startApp(t);
  t.mock.method(console, 'error', () => undefined);
  const response = await app.request('/api/sessions');
  assert.equal(response.status, 500);
  assert.equal((await response.text()).includes('PRIVATE_DATABASE_DETAILS'), false);
  assert.equal(app.queries(), 1);
});
