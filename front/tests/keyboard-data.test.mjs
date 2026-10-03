import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKeyboardBatch, keyboardSummary } from '../../database/keyboard.ts';
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
