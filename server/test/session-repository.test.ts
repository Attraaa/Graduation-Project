import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'mysql2/promise';
import { MysqlSessionRepository } from '../src/repositories/sessions.js';
import { endSession } from '../src/services/sessions.js';

// These check the adapter's SQL/transaction contract, not execution in a selected MySQL deployment.
test('completion uses one connection and persists before aggregating to the session start date', async () => {
  const calls: { operation: string; values?: unknown[] }[] = [];
  const connection = {
    beginTransaction: async () => { calls.push({ operation: 'begin' }); },
    query: async (operation: string, values: unknown[]) => {
      calls.push({ operation, values });
      return operation.startsWith('SELECT') ? [[{ id: 10, user_id: 1, ended_at: null }], []] : [[], []];
    },
    commit: async () => { calls.push({ operation: 'commit' }); },
    rollback: async () => { calls.push({ operation: 'rollback' }); },
    release: () => { calls.push({ operation: 'release' }); },
  };
  const pool = { getConnection: async () => connection } as unknown as Pool;
  await endSession(new MysqlSessionRepository(pool), 1, 10, { score: 0, alertCount: 0 });
  assert.equal(calls.length, 6);
  assert.equal(calls[0].operation, 'begin');
  assert.match(calls[1].operation, /FOR UPDATE/);
  assert.match(calls[2].operation, /ended_at = NOW\(\)/);
  assert.deepEqual(calls[2].values, [0, 0, 10]);
  assert.match(calls[3].operation, /SELECT user_id, DATE\(started_at\), mode/);
  assert.match(calls[3].operation, /GREATEST\(0, TIMESTAMPDIFF\(SECOND, started_at, ended_at\)\)/);
  assert.deepEqual(calls[3].values, [10, 1]);
  assert.equal(calls[4].operation, 'commit');
  assert.equal(calls[5].operation, 'release');
});

test('adapter rolls back and releases its connection when daily aggregation fails', async () => {
  const calls: string[] = [];
  const connection = {
    beginTransaction: async () => { calls.push('begin'); },
    query: async (sql: string) => {
      if (sql.startsWith('INSERT INTO daily_statistics')) throw new Error('aggregation failed');
      return [[{ id: 10, user_id: 1, ended_at: null }], []];
    },
    commit: async () => { calls.push('commit'); },
    rollback: async () => { calls.push('rollback'); },
    release: () => { calls.push('release'); },
  };
  const pool = { getConnection: async () => connection } as unknown as Pool;
  await assert.rejects(endSession(new MysqlSessionRepository(pool), 1, 10, { score: 100, alertCount: 0 }), /aggregation failed/);
  assert.deepEqual(calls, ['begin', 'rollback', 'release']);
});

test('a multi-day session graph separates metrics and full dates without merging repeated clock minutes', async () => {
  const queries: { sql: string; values: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, values: unknown[]) => {
      queries.push({ sql, values });
      return sql.startsWith('SELECT *') ? [[{ id: 10 }], []] : [[], []];
    },
  } as unknown as Pool;
  await new MysqlSessionRepository(pool).detail(1, 10);
  assert.match(queries[1].sql, /GROUP BY metric, DATE_FORMAT\(recorded_at, '%Y-%m-%d %H:%i'\)/);
  assert.match(queries[1].sql, /ORDER BY metric, MIN\(recorded_at\)/);
  assert.match(queries[1].sql, /SELECT metric, DATE_FORMAT\(MIN\(recorded_at\)/);
  assert.match(queries[1].sql, /metric IS NOT NULL/);
  assert.deepEqual(queries[1].values, [10, 1]);
  assert.match(queries[2].sql, /FROM calibration_references WHERE session_id = \? AND user_id = \?/);
  assert.deepEqual(queries[2].values, [10, 1]);
});
