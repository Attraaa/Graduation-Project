import assert from 'node:assert/strict';
import test from 'node:test';
import { appendSessionLog, endSession, parseSessionEnd, parseSessionLog, type Session, type SessionEnd, type SessionLog, type SessionRepository, type SessionTransaction } from '../src/services/sessions.js';

// An isolated transaction store exercises service behavior without choosing/provisioning a team DB.
class MemorySessions implements SessionRepository {
  session: Session & Partial<SessionEnd> = { id: 10, user_id: 1, ended_at: null };
  logs: SessionLog[] = [];
  statistics: SessionEnd[] = [];
  failAggregation = false;
  private queue: Promise<unknown> = Promise.resolve();

  transaction<T>(work: (transaction: SessionTransaction) => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      const session = { ...this.session };
      const logs = [...this.logs];
      const statistics = [...this.statistics];
      const value = await work({
        findOwnedForUpdate: async (id, userId) => session.id === id && session.user_id === userId ? session : null,
        finish: async (_id, result) => { Object.assign(session, result, { ended_at: '2026-09-06T01:00:00Z' }); },
        aggregate: async () => {
          if (this.failAggregation) throw new Error('Storage unavailable');
          statistics.push({ score: session.score!, alertCount: session.alertCount! });
        },
        appendLogs: async (_id, _userId, entries) => { logs.push(...entries); },
        saveCalibration: async () => true,
        appendKeystrokes: async () => undefined,
      });
      this.session = session;
      this.logs = logs;
      this.statistics = statistics;
      return value;
    });
    this.queue = result.catch(() => undefined);
    return result;
  }
}

const finalResult = { score: 75, alertCount: 3 };

test('legacy score and alert count bounds are inclusive and do not coerce missing or invalid inputs', () => {
  for (const score of [0, 1, 99, 100]) {
    const input = Object.freeze({ score, alertCount: 0 });
    assert.deepEqual(parseSessionEnd(input), input);
    assert.deepEqual(parseSessionEnd(input), input);
  }
  assert.deepEqual(parseSessionEnd({ score: 0, alertCount: 2147483647 }), { score: 0, alertCount: 2147483647 });
  for (const score of [undefined, null, -1, 101, 0.5, '80', true, NaN, Infinity]) {
    assert.throws(() => parseSessionEnd({ score, alertCount: 0 }), { status: 400 });
  }
  for (const alertCount of [undefined, null, -1, 2147483648, 0.5, '0', false, NaN, Infinity]) {
    assert.throws(() => parseSessionEnd({ score: 80, alertCount }), { status: 400 });
  }
});

test('logs retain missing measurements separately from a measured zero with its metric', () => {
  for (const status of ['GOOD', 'WARNING', 'DANGER']) {
    assert.deepEqual(parseSessionLog({ status }), { status, metric: null, measuredValue: null, elapsedMs: null });
    assert.deepEqual(parseSessionLog({ status, measuredValue: null }), { status, metric: null, measuredValue: null, elapsedMs: null });
    assert.deepEqual(parseSessionLog({ status, metric: 'nose_offset', measuredValue: 0 }), { status, metric: 'nose_offset', measuredValue: 0, elapsedMs: null });
    assert.throws(() => parseSessionLog({ status, measuredValue: 0 }), { status: 400 });
  }
  for (const measuredValue of [-3.402823466e38, 3.402823466e38]) {
    assert.equal(parseSessionLog({ status: 'WARNING', metric: 'nose_offset', measuredValue }).measuredValue, measuredValue);
  }
  for (const measuredValue of [-3.402824e38, 3.402824e38, NaN, Infinity, '0']) {
    assert.throws(() => parseSessionLog({ status: 'GOOD', metric: 'nose_offset', measuredValue }), { status: 400 });
  }
});

test('another user cannot finish or write logs to a session', async () => {
  const repository = new MemorySessions();
  await assert.rejects(endSession(repository, 2, 10, finalResult), { status: 404 });
  await assert.rejects(appendSessionLog(repository, 2, 10, { status: 'GOOD', metric: null, measuredValue: null, elapsedMs: null }), { status: 404 });
  assert.equal(repository.session.ended_at, null);
  assert.deepEqual(repository.statistics, []);
  assert.deepEqual(repository.logs, []);
});

test('simultaneous completion retries retain the first result and aggregate once', async () => {
  const repository = new MemorySessions();
  await Promise.all([
    endSession(repository, 1, 10, finalResult),
    endSession(repository, 1, 10, { score: 100, alertCount: 0 }),
    endSession(repository, 1, 10, finalResult),
  ]);
  assert.equal(repository.session.score, 75);
  assert.equal(repository.session.alertCount, 3);
  assert.deepEqual(repository.statistics, [finalResult]);
});

test('failed aggregation leaves the session open and can be retried safely', async () => {
  const repository = new MemorySessions();
  repository.failAggregation = true;
  await assert.rejects(endSession(repository, 1, 10, finalResult), /Storage unavailable/);
  assert.equal(repository.session.ended_at, null);
  assert.deepEqual(repository.statistics, []);
  repository.failAggregation = false;
  await endSession(repository, 1, 10, finalResult);
  assert.deepEqual(repository.statistics, [finalResult]);
});

test('logs accepted before completion remain; logs after completion are rejected', async () => {
  const repository = new MemorySessions();
  const log = { status: 'WARNING' as const, metric: 'nose_offset' as const, measuredValue: 12.5, elapsedMs: null };
  await appendSessionLog(repository, 1, 10, log);
  await endSession(repository, 1, 10, finalResult);
  await assert.rejects(appendSessionLog(repository, 1, 10, log), { status: 409 });
  assert.deepEqual(repository.logs, [log]);
});

test('unknown session completion returns not found without changing data', async () => {
  const repository = new MemorySessions();
  await assert.rejects(endSession(repository, 1, 999, finalResult), { status: 404 });
  assert.equal(repository.session.ended_at, null);
});
