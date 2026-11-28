import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import type { Pool } from 'mysql2/promise';
import { limit, mysqlRequestLimits } from '../src/services/requestLimits.js';

function limitsWithHits(t: TestContext, hits: number[]) {
  const increment = t.mock.fn();
  const connection = {
    beginTransaction: t.mock.fn(async () => {}),
    commit: t.mock.fn(async () => {}),
    rollback: t.mock.fn(async () => {}),
    release: t.mock.fn(),
    query: async (sql: string) => {
      if (sql.startsWith('SELECT UNIX_TIMESTAMP')) return [[{ epoch: 1000 }]];
      if (sql.startsWith('INSERT INTO request_limits')) return [];
      if (sql.startsWith('SELECT hits')) return [[{ hits: hits.shift() }]];
      if (sql.startsWith('UPDATE request_limits')) return increment();
      assert.fail(`Unexpected query: ${sql}`);
    },
  };
  const pool = { getConnection: async () => connection, query: async () => [] } as unknown as Pool;
  return { limits: mysqlRequestLimits(pool), connection, increment };
}

const rules = [limit('account', 2, 600), limit('ip', 2, 600)];

test('a blocked reservation rolls back the transaction and keeps the retry time', async t => {
  const { limits, connection, increment } = limitsWithHits(t, [0, 2]);
  assert.equal(await limits.reserve(rules), 200);
  assert.equal(connection.rollback.mock.callCount(), 1);
  assert.equal(connection.commit.mock.callCount(), 0);
  assert.equal(increment.mock.callCount(), 0);
  assert.equal(connection.release.mock.callCount(), 1);
});

test('an accepted reservation commits the increment for every bucket', async t => {
  const { limits, connection, increment } = limitsWithHits(t, [0, 1]);
  assert.equal(await limits.reserve(rules), 0);
  assert.equal(connection.commit.mock.callCount(), 1);
  assert.equal(connection.rollback.mock.callCount(), 0);
  assert.equal(increment.mock.callCount(), rules.length);
  assert.equal(connection.release.mock.callCount(), 1);
});
