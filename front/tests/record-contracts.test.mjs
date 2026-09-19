import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBatch, parseQuery, averageScore } from '../../database/contracts.ts';

import { sampleBatch } from './fixtures/record-batch.mjs';

test('portable record roundtrip preserves unavailable and real zero averages', () => {
  assert.deepEqual(parseBatch(JSON.parse(JSON.stringify(sampleBatch()))), sampleBatch());
  assert.equal(averageScore({ validMs: 0, scoreTimeSum: 0 }), null);
  assert.equal(averageScore({ validMs: 10, scoreTimeSum: 0 }), 0);
});
test('rejects unsupported modes, payload fields, clocks, versions and invalid totals', () => {
  for (const patch of [{ mode: 'keyboard' }, { owner: '' }, { password: 'private' }, { validMs: 1 }, { offsetMinutes: 900 }, { runMs: NaN }, { longestContinuousMs: 1 }]) {
    const batch = sampleBatch(); Object.assign(batch.record, patch); assert.throws(() => parseBatch(batch));
  }
  for (const patch of [{ sequence: -1 }, { schemaVersion: 2 }, { buckets: Array(121).fill({}) }]) assert.throws(() => parseBatch({ ...sampleBatch(), ...patch }));
});
test('queries validate real dates, mode isolation and bounded periods', () => {
  assert.equal(parseQuery({ owner: 'demo', from: '2026-01-01', to: '2026-01-31', mode: 'shoulder' }).mode, 'shoulder');
  for (const patch of [{ from: '2026-02-30' }, { to: '2028-01-01' }, { mode: 'eye' }, { sql: 'select 1' }]) {
    assert.throws(() => parseQuery({ owner: 'demo', from: '2026-01-01', to: '2026-01-31', ...patch }));
  }
});
