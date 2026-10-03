import assert from 'node:assert/strict';
import { once } from 'node:events';
import test, { type TestContext } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Pool } from 'mysql2/promise';
import express from 'express';
import { createApp } from '../src/app.js';
import { createAuth } from '../src/auth.js';
import { readConfig } from '../src/config.js';
import { emptyTotals, AGGREGATION_VERSION } from '../../database/contracts.ts';
import { emptyEyeTotals } from '../../database/eye.ts';
import { createRecordsRouter } from '../src/routes/records.js';
import type { MysqlRecordRepository } from '../src/repositories/records.js';
import { handleError } from '../src/http.js';

const config = readConfig({ JWT_SECRET: 'test-only-secret-012345678901234567890' });
const token = createAuth(config.jwt).signToken({ userId: 7, username: 'tester' });
const batch = (owner: string) => ({ schemaVersion: 1, aggregationPolicyVersion: AGGREGATION_VERSION, generation: 0, sequence: 0,
  record: { ...emptyTotals(), id: 'one', owner, mode: 'turtle', startedAt: 1800000000000, updatedAt: 1800000000000, offsetMinutes: -540,
    scorePolicyVersion: 'turtle-v1', habitPolicyVersion: 'habit-v1', longestContinuousMs: 0, status: 'running' }, buckets: [] });
const eyeBatch = (owner: string) => ({ schemaVersion: 1, generation: 0, sequence: 0,
  record: { ...emptyEyeTotals(), id: 'eye-one', owner, mode: 'eye', startedAt: 1800000000000, updatedAt: 1800000000000,
    offsetMinutes: -540, policyVersion: 'eye-habits-v2', status: 'running' }, buckets: [] });

// Every case here must be decided before storage; the database stub fails loudly if reached.
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

test('record routes require authentication before storage', async (t) => {
  const app = await startApp(t);
  for (const [method, path] of [['GET', '/api/records/generation'], ['DELETE', '/api/records'], ['POST', '/api/records/posture'],
    ['GET', '/api/records/posture?from=2026-10-01&to=2026-10-01'], ['GET', '/api/records/keyboard/one'],
    ['POST', '/api/records/eye'], ['GET', '/api/records/eye/one'],
    ['GET', '/api/records/eye-statistics?from=2026-10-01&to=2026-10-01'],
    ['GET', '/api/records/history?from=2026-10-01&to=2026-10-01']]) {
    const response = await app.request(path, { method, headers: { authorization: '' } });
    assert.equal(response.status, 401, `${method} ${path}`);
  }
  assert.equal(app.queries(), 0);
});

test('batches owned by another user and invalid contracts are rejected before storage', async (t) => {
  const app = await startApp(t);
  const foreign = await app.request('/api/records/posture', { method: 'POST', body: JSON.stringify(batch('8')) });
  assert.equal(foreign.status, 403);
  const invalid = batch('7') as Record<string, unknown>;
  invalid.extra = true;
  const unsupported = await app.request('/api/records/posture', { method: 'POST', body: JSON.stringify(invalid) });
  assert.equal(unsupported.status, 400);
  assert.match((await unsupported.json()).message, /필드/);
  const keyboard = await app.request('/api/records/keyboard', { method: 'POST', body: JSON.stringify({ schemaVersion: 2 }) });
  assert.equal(keyboard.status, 400);
  const foreignEye = await app.request('/api/records/eye', { method: 'POST', body: JSON.stringify(eyeBatch('8')) });
  assert.equal(foreignEye.status, 403);
  const invalidEye = eyeBatch('7'); invalidEye.record.validMs = 1;
  const eye = await app.request('/api/records/eye', { method: 'POST', body: JSON.stringify(invalidEye) });
  assert.equal(eye.status, 400);
  const extraEye = await app.request('/api/records/eye', { method: 'POST', body: JSON.stringify({ ...eyeBatch('7'), extra: true }) });
  assert.equal(extraEye.status, 400);
  assert.equal(app.queries(), 0);
});

test('queries accept only range, mode and offset; the owner always comes from the token', async (t) => {
  const app = await startApp(t);
  for (const path of [
    '/api/records/posture?from=2026-10-01&to=2026-10-01&owner=8',
    '/api/records/posture?from=2026-10-01&to=2026-10-01&offset=-1',
    '/api/records/posture?from=2026-10-02&to=2026-10-01',
    '/api/records/posture-statistics?from=2026-10-01&to=2026-10-01&offset=0',
    '/api/records/posture?from=2026-10-01&to=2026-10-01&mode=eye',
    '/api/records/keyboard?from=2026-10-01&to=2026-10-01&mode=turtle',
    '/api/records/eye-statistics?from=2026-10-01&to=2026-10-01&owner=8',
    '/api/records/eye-statistics?from=2026-10-01&to=2026-10-01&mode=turtle',
    '/api/records/eye-statistics?from=2026-10-01&to=2026-10-01&offset=0',
    '/api/records/history?from=2026-10-01&to=2026-10-01&owner=8',
    '/api/records/history?from=2026-10-01&to=2026-10-01&mode=eye',
    '/api/records/history?from=2026-10-01&to=2026-10-01&offset=-1',
    '/api/records/posture?from=2026-10-01&from=2026-10-02&to=2026-10-03',
  ]) {
    const response = await app.request(path);
    assert.equal(response.status, 400, path);
  }
  assert.equal(app.queries(), 0);
});

test('eye and mixed-history routes forward parsed input with the authenticated user', async t => {
  const calls: unknown[][] = [];
  const repository = {
    writeEye: async (...args: unknown[]) => { calls.push(['writeEye', ...args]); },
    eyeDetail: async (...args: unknown[]) => { calls.push(['eyeDetail', ...args]); return { record: eyeBatch('7').record, buckets: [] }; },
    eyeStatistics: async (...args: unknown[]) => { calls.push(['eyeStatistics', ...args]); return []; },
    history: async (...args: unknown[]) => { calls.push(['history', ...args]); return { records: [], counts: {}, hasMore: false }; },
  } as unknown as MysqlRecordRepository;
  const app = express();
  app.use(express.json(), createRecordsRouter(repository, createAuth(config.jwt)), handleError);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, options: RequestInit = {}) => fetch(base + path, {
    ...options, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(10000),
  });
  const value = eyeBatch('7');
  assert.equal((await request('/eye', { method: 'POST', body: JSON.stringify(value) })).status, 204);
  assert.equal((await request('/eye/eye-one')).status, 200);
  assert.equal((await request('/eye-statistics?from=2026-10-01&to=2026-10-03')).status, 200);
  const history = await request('/history?from=2026-10-01&to=2026-10-03&offset=100');
  assert.deepEqual(await history.json(), { records: [], counts: {}, hasMore: false });
  assert.deepEqual(calls, [
    ['writeEye', 7, value], ['eyeDetail', 7, 'eye-one'],
    ['eyeStatistics', 7, { owner: '7', from: '2026-10-01', to: '2026-10-03', mode: undefined, offset: 0 }],
    ['history', 7, { owner: '7', from: '2026-10-01', to: '2026-10-03', mode: undefined, offset: 100 }],
  ]);
});
