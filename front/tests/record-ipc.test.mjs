import test from 'node:test';
import assert from 'node:assert/strict';
import { recordCall, requireRecords, trustedRecordUrl } from '../electron/recordHandlers.ts';
test('untrusted calls cannot reach the database and failures never return success', () => {
  let reached = false;
  assert.equal(recordCall(false, () => { reached = true; }).ok, false);
  assert.equal(reached, false);
  assert.deepEqual(recordCall(true, () => requireRecords(null, 'disk unavailable')), { ok: false, error: 'disk unavailable' });
  assert.deepEqual(recordCall(true, () => 42), { ok: true, value: 42 });
});
test('record permissions remain bound to the original application document', () => {
  assert.equal(trustedRecordUrl('file:///app/index.html#/history', 'file:///app/index.html'), true);
  assert.equal(trustedRecordUrl('https://untrusted.test', 'file:///app/index.html'), false);
  assert.equal(trustedRecordUrl('http://localhost:9999/', 'http://localhost:5173/'), false);
});
