import test from 'node:test';
import assert from 'node:assert/strict';
import { trustedRecordUrl } from '../electron/recordHandlers.ts';
test('record permissions remain bound to the original application document', () => {
  assert.equal(trustedRecordUrl('file:///app/index.html#/history', 'file:///app/index.html'), true);
  assert.equal(trustedRecordUrl('https://untrusted.test', 'file:///app/index.html'), false);
  assert.equal(trustedRecordUrl('http://localhost:9999/', 'http://localhost:5173/'), false);
});
