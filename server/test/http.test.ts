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
  for (const path of ['/api/sessions', '/api/statistics/today', '/api/auth/me', '/api/auth/me/settings', '/api/feedback']) {
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
    { path: '/api/auth/me/settings', method: 'PUT', body: [] },
    { path: '/api/auth/me/settings', method: 'PUT', body: { theme: { nested: true } } },
    { path: '/api/sessions/1/calibration', method: 'POST', body: {} },
    { path: '/api/sessions/1/logs/batch', method: 'POST', body: { logs: [] } },
    { path: '/api/sessions/1/logs/batch', method: 'POST', body: { logs: [{ status: 'GOOD', measuredValue: 0.2 }] } },
    { path: '/api/sessions/1/keystrokes', method: 'POST', body: { events: [{ verdict: 'unknown' }] } },
    { path: '/api/feedback', method: 'POST', body: { feedbackText: '오늘은 어깨가 올라갔습니다.' } },
    { path: '/api/feedback', method: 'POST', body: { date: '2026-09-19', mode: 'wrist', feedbackText: '기록' } },
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

test('measurement routes are mounted and reach storage once their input is valid', async (t) => {
  const app = await startApp(t);
  t.mock.method(console, 'error', () => undefined);
  const valid = [
    {
      path: '/api/sessions/1/calibration',
      body: {
        schemaVersion: 1, sourceId: 'track-1', widthPx: 1280, heightPx: 720, sampleCount: 24,
        startedAtMs: 1000, completedAtMs: 4000,
        metrics: {
          noseOffsetShoulderWidths: -0.02,
          noseHeightShoulderWidths: 0.61,
          shoulderHeightDifferenceShoulderWidths: 0.03,
        },
      },
    },
    { path: '/api/sessions/1/logs/batch', body: { logs: [{ status: 'UNAVAILABLE' }] } },
    {
      path: '/api/sessions/1/keystrokes',
      body: {
        events: [{
          keyCode: 'KeyF', observedFinger: 'left:index', verdict: 'preferred', reason: 'preferred-finger',
          confidence: 0.82, frameDeltaMs: -35, policyId: 'ansi-qwerty-touch', policyVersion: '1.0.0',
        }],
      },
    },
  ];
  for (const request of valid) {
    const response = await app.request(request.path, { method: 'POST', body: JSON.stringify(request.body) });
    assert.equal(response.status, 500, request.path);
    assert.equal((await response.text()).includes('PRIVATE_DATABASE_DETAILS'), false);
  }
  assert.equal(app.queries(), valid.length);
});
