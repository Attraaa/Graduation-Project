import assert from 'node:assert/strict';
import test from 'node:test';
import { scorePosture } from '../src/features/posture/scoring.ts';
import { shoulderScorePolicy as shoulder } from '../src/features/posture/modes/shoulder.ts';
import { SHOULDER_WEIGHTS, SHOULDER_LIMITS, scoreSettingsVersion } from '../src/features/posture/scoreSettings.ts';
// The ratio-based weighted score is the shoulder's; the neck score comes from E19 (tests/e19-runtime.test.mjs).
const policies = [shoulder];
const delta = (value = 0, overrides = {}) => ({ shoulderTilt: value, shoulderShrug: value, yawRatio: 0, ...overrides });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('the shoulder uses its own weighted sum rather than the largest feature', () => {
  close(scorePosture(delta(0, { shoulderTilt: 0.2, shoulderShrug: 0.1 }), shoulder).deviation, 0.1775);
  close(Object.values(SHOULDER_WEIGHTS).reduce((a,b) => a+b), 1);
});
test('yaw boundary preserves frontal scoring and suspends a turned-head score', () => {
  const sample = delta(0, { shoulderTilt: 0.2, shoulderShrug: 0.1 });
  close(scorePosture({ ...sample, yawRatio: 0.15 }, shoulder).deviation, 0.1775);
  for (const policy of policies) {
    assert.ok(scorePosture({ ...sample, yawRatio: 0.15 }, policy).score !== null);
    for (const yawRatio of [0.15 + 1e-9, 1, -0.1, NaN, Infinity, undefined])
      assert.deepEqual(scorePosture({ ...sample, yawRatio }, policy), { scorePolicyVersion: policy.version, score: null, deviation: null });
  }
});
test('full and zero credit boundaries, linear midpoint and adjacent values', () => {
  for (const policy of policies) {
    const a = policy.fullCreditDelta, b = policy.zeroCreditDelta;
    const sample = d => delta(0, { shoulderTilt: d / SHOULDER_WEIGHTS.shoulderTilt });
    close(scorePosture(sample(a), policy).score, 100);
    assert.ok(scorePosture(sample(a + 1e-8), policy).score < 100);
    close(scorePosture(sample((a+b)/2), policy).score, 50);
    assert.ok(scorePosture(sample(b - 1e-8), policy).score > 0);
    close(scorePosture(sample(b), policy).score, 0);
    close(scorePosture(sample(b+1), policy).score, 0);
  }
});
test('missing and invalid inputs are unknown; zero is a real measured score', () => {
  for (const policy of policies) {
    const unknown = { scorePolicyVersion: policy.version, score: null, deviation: null };
    assert.deepEqual(scorePosture(null, policy), unknown);
    assert.equal(scorePosture(delta(1), policy).score, 0);
    for (const metric of Object.keys(policy.weights)) for (const value of [NaN, Infinity, undefined, -0.1]) {
      assert.deepEqual(scorePosture(delta(0, { [metric]: value }), policy), unknown);
    }
  }
});
test('inputs are deterministic and immutable', () => {
  const sample = Object.freeze(delta(0.1234));
  for (const policy of policies) {
    const before = structuredClone({ sample, policy });
    assert.deepEqual(scorePosture(sample, policy), scorePosture(sample, policy));
    assert.deepEqual({ sample, policy }, before);
    assert.ok(Object.isFrozen(policy.weights));
  }
});
test('score decreases monotonically within zero and one hundred', () => {
  for (const policy of policies) {
    let previous = 100;
    for (let i=0; i<=1000; i++) {
      const score=scorePosture(delta(i/1000), policy).score;
      assert.ok(score >= 0 && score <= previous); previous=score;
    }
  }
});
test('the shoulder policy version is unchanged and tuning creates a different one', () => {
  // Same ID as before the neck model change, so existing shoulder records stay in the same statistics group.
  assert.equal(shoulder.version, 'upper-body-shoulder-v3-1xhti1n');
  assert.notEqual(scoreSettingsVersion('shoulder', { ...SHOULDER_WEIGHTS, shoulderTilt: 0.6 }, SHOULDER_LIMITS), shoulder.version);
});
