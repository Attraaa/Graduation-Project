import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { emptyEyeTotals } from '../../database/eye.ts';
import { MemoryRecords, memoryServer, loggedIn } from './fixtures/memory-records.mjs';

test('eye HTTP client sends JWT, omits owner query parameters, encodes ids and exposes server errors', async t => {
  const db = new MemoryRecords(), server = memoryServer(db, '7'), originalFetch = globalThis.fetch, requests = [];
  globalThis.localStorage = loggedIn('7'); globalThis.window = { location: { hash: '#/statistics' } };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, ...options });
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    return server.fetch(url, options);
  };
  t.after(() => { globalThis.fetch = originalFetch; delete globalThis.localStorage; delete globalThis.window; });
  const compiled = await build({ entryPoints: ['src/features/records/api.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
  const { recordsApi, recordValue } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const api = recordsApi(), epoch = Date.parse('2026-10-01T12:00:00Z');
  const batch = { schemaVersion: 1, generation: 0, sequence: 0, buckets: [], record: {
    ...emptyEyeTotals(), id: 'eye:/한글', owner: '7', mode: 'eye', startedAt: epoch, updatedAt: epoch,
    offsetMinutes: 0, policyVersion: 'eye-habits-v2', status: 'running',
  } };
  assert.equal(await recordValue(api.generation('999')), 0);
  await recordValue(api.writeEye(batch));
  const query = { owner: '999', from: '2026-10-01', to: '2026-10-02' };
  assert.deepEqual(await recordValue(api.eyeStatistics(query)), []);
  assert.equal((await recordValue(api.eyeDetail('999', batch.record.id))).record.owner, '7');
  assert.equal((await recordValue(api.history(query))).records[0].id, batch.record.id);
  assert.equal((await recordValue(api.history({ ...query, offset: 1 }))).records.length, 0);
  const urls = requests.map(({ url }) => new URL(url, 'http://moti.test'));
  assert.ok(urls.some(url => url.pathname === '/api/records/eye/' + encodeURIComponent(batch.record.id)));
  assert.ok(urls.some(url => url.pathname === '/api/records/history' && url.searchParams.get('offset') === '1'));
  assert.ok(urls.every(url => !url.searchParams.has('owner')));
  const posted = requests.find(request => request.method === 'POST');
  assert.equal(posted.headers['Content-Type'], 'application/json'); assert.deepEqual(JSON.parse(posted.body), batch);
  server.fail('/api/records/eye', 'temporary eye API error');
  await assert.rejects(recordValue(api.writeEye(batch)), /temporary eye API error/);
  await recordValue(api.writeEye(batch));
  assert.equal(db.history({ ...query, owner: '7' }).records.length, 1);
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'expired' }), { status: 401 });
  await assert.rejects(recordValue(api.generation('7')), /로그인이 만료/);
  assert.equal(globalThis.localStorage.getItem('moti.session'), null);
  assert.equal(globalThis.window.location.hash, '#/login');
});
