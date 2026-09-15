import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import type { Pool } from 'mysql2/promise';
import { createApp } from '../src/app.js';
import { createAuth } from '../src/auth.js';
import { readConfig } from '../src/config.js';
import { averageSessionScore } from '../src/services/statistics.js';

const config = readConfig({ JWT_SECRET: 'test-only-secret-012345678901234567890' });
const token = createAuth(config.jwt).signToken({ userId: 1, username: 'tester' });

async function startApp(t: TestContext, rows: Record<string, unknown>[]) {
  const queries: { sql: string; values: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, values: unknown[]) => {
      queries.push({ sql, values });
      return [rows, []];
    },
  } as unknown as Pool;
  const server = createApp(config, pool).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    queries,
    get: async (path: string) => {
      const response = await fetch(`${base}/api/statistics${path}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
      assert.equal(response.status, 200);
      return response.json();
    },
  };
}

test('legacy averages weight sessions, distinguish missing scores from zero, and round only the result', () => {
  const cases = [
    { rows: [], expected: null },
    { rows: [{ average_score: null, session_count: 2 }], expected: null },
    { rows: [{ average_score: 0, session_count: 1 }], expected: 0 },
    { rows: [{ average_score: 100, session_count: 1 }], expected: 100 },
    { rows: [{ average_score: 100, session_count: 0 }], expected: null },
    { rows: [{ average_score: null, session_count: 9 }, { average_score: 80, session_count: 1 }], expected: 80 },
    { rows: [{ average_score: 90, session_count: 9 }, { average_score: 0, session_count: 1 }], expected: 81 },
    { rows: [{ average_score: 80, session_count: 1 }, { average_score: 81, session_count: 1 }], expected: 81 },
    { rows: [{ average_score: 80, session_count: 2 }, { average_score: 81, session_count: 1 }], expected: 80 },
  ];
  for (const { rows, expected } of cases) {
    const before = structuredClone(rows);
    assert.equal(averageSessionScore(rows), expected);
    assert.equal(averageSessionScore(rows), expected);
    assert.equal(averageSessionScore([...rows].reverse()), expected);
    assert.deepEqual(rows, before);
  }
});

test('today and calendar return the same session-weighted score for the same day', async (t) => {
  const rows = [
    { date: '2026-09-11', mode: 'turtle', average_score: 90, session_count: 9, total_monitoring_seconds: 540 },
    { date: '2026-09-11', mode: 'shoulder', average_score: 0, session_count: 1, total_monitoring_seconds: 60 },
  ];
  const app = await startApp(t, rows);
  const today = await app.get('/today');
  assert.deepEqual(today, { averageScore: 81, sessionCount: 10, totalSeconds: 600, byMode: rows });
  const calendar = [{ date: '2026-09-11', session_count: 10, avg_score: 81 }];
  assert.deepEqual(await app.get('/calendar?year=2026&month=9'), calendar);
  assert.deepEqual(await app.get('/calendar?year=2026&month=9'), calendar);
  assert.deepEqual(app.queries[1].values, [1, 2026, 9]);
});

test('calendar preserves distinct dates at midnight, missing scores and zero scores', async (t) => {
  const app = await startApp(t, [
    { date: '2026-09-11', average_score: 90, session_count: 2 },
    { date: '2026-09-12', average_score: 0, session_count: 1 },
    { date: '2026-09-12', average_score: null, session_count: 3 },
    { date: '2026-09-13', average_score: null, session_count: 2 },
  ]);
  assert.deepEqual(await app.get('/calendar?year=2026&month=9'), [
    { date: '2026-09-11', session_count: 2, avg_score: 90 },
    { date: '2026-09-12', session_count: 4, avg_score: 0 },
    { date: '2026-09-13', session_count: 2, avg_score: null },
  ]);
});

test('no recorded sessions produce no score or improvement', async (t) => {
  const app = await startApp(t, []);
  assert.deepEqual(await app.get('/today'), { averageScore: null, sessionCount: 0, totalSeconds: 0, byMode: [] });
  assert.deepEqual(await app.get('/calendar?year=2026&month=9'), []);
  assert.deepEqual(await app.get('/improvement'), { todayAvg: null, yesterdayAvg: null, improvement: null });
});

test('improvement retains zero and skips missing scores while using the DB day classification', async (t) => {
  const app = await startApp(t, [
    { score: null, period: 'today' }, { score: 0, period: 'today' },
    { score: 100, period: 'yesterday' }, { score: 50, period: 'yesterday' },
  ]);
  assert.deepEqual(await app.get('/improvement'), { todayAvg: 0, yesterdayAvg: 75, improvement: -100 });
  assert.match(app.queries[0].sql, /DATE\(started_at\) = CURDATE\(\)/);
  assert.match(app.queries[0].sql, /ended_at IS NOT NULL/);
});

test('improvement with a zero denominator remains unavailable', async (t) => {
  const app = await startApp(t, [{ score: 80, period: 'today' }, { score: 0, period: 'yesterday' }]);
  assert.deepEqual(await app.get('/improvement'), { todayAvg: 80, yesterdayAvg: 0, improvement: null });
});
