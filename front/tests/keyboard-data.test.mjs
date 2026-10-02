import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RecordRepository } from '../../database/sqlite/repository.ts';
import { parseKeyboardBatch, keyboardSummary } from '../../database/keyboard.ts';
import { sampleBatch } from './fixtures/record-batch.mjs';
import { cameraTransform, normalizeKeyboardCamera, defaultKeyboardCamera } from '../src/features/keyboard/camera.ts';
import { evaluatePress } from '../src/features/keyboard/evaluatePress.ts';
import { ANSI_QWERTY_TOUCH_POLICY_V1 } from '../src/features/keyboard/fingerPolicy.ts';

function batch() {
  const startedAt = Date.parse('2026-10-01T00:00:00Z');
  return { schemaVersion: 1, generation: 0, sequence: 0,
    record: { id: 'keyboard-one', owner: 'demo', startedAt, updatedAt: startedAt + 1000, offsetMinutes: -540,
      status: 'running', policyVersion: 'ansi-qwerty-touch:2.0.0', recognitionVersion: 'hands-label-distance-v2', nearbyCredit: 70, total: 10 },
    counts: [{ date: '2026-10-01', code: 'KeyA', context: 'plain', finger: 'left:pinky', verdict: 'preferred', reason: 'preferred-finger', count: 8 },
      { date: '2026-10-01', code: 'KeyA', context: 'plain', finger: 'left:ring', verdict: 'nearby', reason: 'neighboring-finger', count: 2 }] };
}
function fixture(t) { const directory = mkdtempSync(join(tmpdir(), 'moti-keyboard-')); t.after(() => rmSync(directory, { recursive: true, force: true })); return join(directory, 'records.sqlite'); }

test('100/70/0 score excludes ambiguity, separates coverage, and never rewards consistency', () => {
  const counts = batch().counts;
  const unknown = { ...counts[0], finger: null, verdict: 'unknown', reason: 'ambiguous-candidates', count: 10 };
  const unsupported = { ...unknown, code: 'ShiftLeft', reason: 'unsupported-key', count: 5 };
  const summary = keyboardSummary([...counts, unknown, unsupported]);
  assert.equal(summary.score, 94); assert.equal(summary.agreement, 80); assert.equal(summary.coverage, 50);
  assert.equal(summary.consistency, 80); assert.equal(summary.unsupported, 5);
  const consistent = counts.map(row => ({ ...row, finger: 'left:ring', verdict: 'nearby', reason: 'neighboring-finger' }));
  assert.equal(keyboardSummary(consistent).score, 70); assert.equal(keyboardSummary(consistent).consistency, 100);
  assert.equal(keyboardSummary([counts[0]]).consistency, null);
  assert.equal(keyboardSummary([counts[0], { ...counts[1], context: 'shift-left' }]).consistency, null);
});
test('strict aggregate input rejects text, sequences, unknown physical codes, and inconsistent counts', () => {
  assert.deepEqual(parseKeyboardBatch(batch()), batch());
  for (const mutate of [b => { b.text = 'secret'; }, b => { b.counts[0].sequence = 1; },
    b => { b.counts[0].code = 'secret'; }, b => { b.record.total++; }, b => { b.counts.push(b.counts[0]); },
    b => { b.counts[0].finger = null; }, b => { b.counts[0].date = '2026-09-30'; }, b => { b.counts[0].reason = 'different-finger'; }]) {
    const value = batch(); mutate(value); assert.throws(() => parseKeyboardBatch(value));
  }
});
test('additive schema v1 migration preserves posture data and supports keyboard restarts and owner isolation', t => {
  const file = fixture(t); let db = new RecordRepository(file); const posture = sampleBatch(); db.write(posture); db.close();
  // Construct a real v1 database from its unchanged original tables.
  const v1 = new DatabaseSync(file); v1.exec('DROP TABLE eye_batches; DROP TABLE eye_buckets; DROP TABLE eye_records; DROP TABLE keyboard_batches; DROP TABLE keyboard_counts; DROP TABLE keyboard_records; PRAGMA user_version=1'); v1.close();
  db = new RecordRepository(file);
  assert.equal(db.detail('demo', posture.record.id).record.status, 'interrupted');
  assert.equal(db.detail('demo', posture.record.id).record.owner, 'demo');
  const value = batch(); db.writeKeyboard(value); db.writeKeyboard(value);
  assert.equal(db.keyboardDetail('demo', value.record.id).record.total, 10);
  assert.throws(() => db.keyboardDetail('other', value.record.id));
  assert.throws(() => db.writeKeyboard({ ...value, record: { ...value.record, total: 9 } }));
  const next = structuredClone(value); next.sequence++; next.counts[0].count++; next.record.total++; db.writeKeyboard(next);
  const bad = structuredClone(next); bad.sequence++; bad.counts[0].count--; bad.counts[1].count++; assert.throws(() => db.writeKeyboard(bad), /누적값/);
  assert.equal(db.keyboardDetail('demo', value.record.id).record.total, 11);
  const different = structuredClone(value); different.record.owner = 'other'; different.record.id = 'other'; db.writeKeyboard(different);
  db.close(); db = new RecordRepository(file);
  assert.equal(db.keyboardDetail('demo', value.record.id).record.status, 'interrupted');
  assert.equal(db.keyboardStatistics({ owner: 'demo', from: '2026-10-01', to: '2026-10-01' }).length, 1);
  assert.equal(db.clear('demo'), 1); assert.throws(() => db.writeKeyboard(value), /삭제/);
  assert.throws(() => db.detail('demo', posture.record.id)); assert.throws(() => db.keyboardDetail('demo', value.record.id));
  assert.equal(db.keyboardDetail('other', 'other').record.total, 10); assert.equal(db.integrity(), 'ok'); db.close();
});
test('arbitrary rotation retains source resolution and covers every output corner without black areas', () => {
  for (const [w, h] of [[1280, 720], [640, 480], [720, 1280]]) for (const angle of [-180, -135, -90, -45, -1, 0, 17, 80, 90, 133, 179]) {
    const camera = normalizeKeyboardCamera({ ...defaultKeyboardCamera, left: .2, top: .3, width: .5, height: .4, angle });
    const transform = cameraTransform(w, h, camera);
    for (const x of [-w / 2, w / 2]) for (const y of [-h / 2, h / 2]) {
      const sourceX = (x * Math.cos(transform.radians) + y * Math.sin(transform.radians)) / transform.scale;
      const sourceY = (-x * Math.sin(transform.radians) + y * Math.cos(transform.radians)) / transform.scale;
      assert.ok(Math.abs(sourceX) <= transform.width / 2 + 1e-8);
      assert.ok(Math.abs(sourceY) <= transform.height / 2 + 1e-8);
    }
  }
});
test('only adjacent fingers of the same hand earn partial credit; malformed or duplicate candidates do not force errors', () => {
  const options = { minKeyboardConfidence: .7, minFingerConfidence: .7, maxAbsoluteFrameDeltaMs: 100, maxNormalizedDistanceToTarget: .8, ambiguityNormalizedDistance: .1 };
  const point = (hand, finger, distance = .1) => ({ hand, finger, confidence: .9, normalizedDistanceToTarget: distance, insideTarget: true });
  const evaluate = candidates => evaluatePress({ code: 'KeyQ', keyboardConfidence: .9, frameDeltaMs: 10, candidates }, ANSI_QWERTY_TOUCH_POLICY_V1, options);
  assert.equal(evaluate([point('left', 'ring')]).verdict, 'nearby');
  for (const finger of ['middle', 'index', 'thumb']) assert.equal(evaluate([point('left', finger)]).verdict, 'mismatch');
  assert.equal(evaluate([point('right', 'ring')]).verdict, 'mismatch');
  assert.equal(evaluate([point('left', 'pinky'), point('left', 'pinky')]).verdict, 'preferred');
  assert.equal(evaluate([point('left', 'pinky', -1)]).verdict, 'unknown');
  assert.equal(evaluate([point('left', 'pinky'), point('left', 'ring', .15)]).verdict, 'unknown');
});
