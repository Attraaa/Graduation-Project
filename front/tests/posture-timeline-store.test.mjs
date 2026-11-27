import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createPostureTimelineStore } from '../electron/postureTimelineStore.ts';

const session = {
  id: '6f9619ff-8b86-4f7d-9ada-61f65ee66e41',
  startedAt: 1_789_000_000_000,
  scorePolicyVersions: { neck: 'neck-v3', shoulder: 'shoulder-v3' },
  habitPolicyVersion: 'weighted-reference-deviation-v3:s60',
};
const point = (second, neck) => ({ second, neck, shoulder: null, neckValidMs: neck === null ? 0 : 450, shoulderValidMs: 0 });
const filename = (root, owner) => join(root, `account-${owner}`, `${session.id}.jsonl`);
const summaryFilename = (root, owner) => join(root, `account-${owner}`, `${session.id}.summary.json`);
const batch = (owner, points, endedAt = null) => ({ owner, session, points, endedAt });

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'moti-posture-timeline-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, store: createPostureTimelineStore(root) };
}

test('writes one JSON Lines session with ordered measurements, null gaps and completion', async t => {
  const { root, store } = await setup(t);
  await Promise.all([
    store.write(batch('42', [point(1, 0)])),
    store.write(batch('42', [point(2, null), point(3, 80.75)])),
  ]);
  await assert.rejects(readFile(summaryFilename(root, '42')), { code: 'ENOENT' });
  const endedAt = session.startedAt + 3500;
  await store.write(batch('42', [], endedAt));
  const data = await readFile(filename(root, '42'), 'utf8');
  const [header, ...rows] = data.trimEnd().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(header, {
    type: 'session', schemaVersion: 1, sampleIntervalMs: 1000, scoreAggregation: 'valid-time-weighted-mean', ...session,
  });
  assert.deepEqual(rows, [
    { type: 'sample', ...point(1, 0) },
    { type: 'sample', ...point(2, null) },
    { type: 'sample', ...point(3, 80.75) },
    { type: 'end', endedAt },
  ]);
  const summary = JSON.parse(await readFile(summaryFilename(root, '42'), 'utf8'));
  assert.equal(summary.sampledSeconds, 3);
  assert.equal(summary.elapsedMs, 3500);
  assert.equal(summary.neck.meanPoints, 40.4);
  assert.equal(summary.neck.firstHalf.meanPoints, 0);
  assert.equal(summary.neck.secondHalf.meanPoints, 80.8);
  assert.equal(summary.shoulder.meanPoints, null);
  assert.equal(summary.shoulder.mostObservedBand, null);
  const saved = await store.read('42', session.startedAt, endedAt + 1);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].neck.meanPoints, 40.4);
  assert.deepEqual(await store.read('43', session.startedAt, endedAt + 1), []);
  assert.deepEqual(await store.read('42', endedAt, endedAt + 1), []);
});

test('retries a failed summary save without duplicating observations and weights by valid time', async t => {
  const { root, store } = await setup(t);
  const summaryPath = summaryFilename(root, '42');
  await store.write(batch('42', [
    { ...point(1, 80), neckValidMs: 1000 },
    { ...point(2, 0), neckValidMs: 250 },
  ]));
  await mkdir(summaryPath);
  const final = batch('42', [point(3, null), { ...point(4, 84), neckValidMs: 750 }], session.startedAt + 4500);
  await assert.rejects(store.write(final));
  await rmdir(summaryPath);
  await store.write(final);

  const lines = (await readFile(filename(root, '42'), 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(lines.filter(row => row.type === 'sample').map(row => row.second), [1, 2, 3, 4]);
  assert.equal(lines.filter(row => row.type === 'end').length, 1);
  const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
  assert.equal(summary.splitAfterSecond, 2);
  assert.deepEqual(summary.neck, {
    validMs: 2000,
    meanPoints: 71.5,
    observedPercentOfSession: 44.4,
    mostObservedBand: { fromPoints: 80, toPoints: 85, includesUpperBound: false, percentOfValidTime: 87.5 },
    firstHalf: { validMs: 1250, meanPoints: 64 },
    secondHalf: { validMs: 750, meanPoints: 84 },
  });
});

test('rejects invalid paths and sample sequences and clears only the requested account', async t => {
  const { root, store } = await setup(t);
  await assert.rejects(store.write(batch('../42', [point(1, 80)])), /계정/);
  await assert.rejects(store.write({ ...batch('42', [point(1, 80)]), session: { ...session, id: '../other' } }), /상체 기록/);
  await assert.rejects(store.write(batch('42', [point(2, 70)])), /시간 순서/);
  await assert.rejects(store.write(batch('42', [point(1, 200)])), /상체 기록/);
  await store.write(batch('42', [], session.startedAt + 500));
  await assert.rejects(readFile(filename(root, '42')), { code: 'ENOENT' });
  await Promise.all([
    store.write(batch('42', [point(1, 80)], session.startedAt + 1100)),
    store.write(batch('420', [point(1, 75)], session.startedAt + 1100)),
    store.clear('42'),
  ]);
  await assert.rejects(readFile(filename(root, '42')), { code: 'ENOENT' });
  await assert.rejects(readFile(summaryFilename(root, '42')), { code: 'ENOENT' });
  assert.match(await readFile(filename(root, '420'), 'utf8'), /"neck":75/);
  assert.equal(JSON.parse(await readFile(summaryFilename(root, '420'), 'utf8')).neck.meanPoints, 75);
});
