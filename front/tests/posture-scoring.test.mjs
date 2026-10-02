import assert from 'node:assert/strict';
import test from 'node:test';
import { scorePosture } from '../src/features/posture/scoring.ts';
import { turtleScorePolicy as neck } from '../src/features/posture/modes/turtle.ts';
import { shoulderScorePolicy as shoulder } from '../src/features/posture/modes/shoulder.ts';
import { NECK_WEIGHTS, SHOULDER_WEIGHTS, scoreSettingsVersion, NECK_LIMITS } from '../src/features/posture/scoreSettings.ts';
const policies = [neck, shoulder];
const delta = (value = 0, overrides = {}) => ({ headForward: value, torsoForward: value, neckSlump: value, shoulderTilt: value, shoulderShrug: value, yawRatio: 0, ...overrides });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('each part uses its own weighted sum rather than the largest feature or a combined score', () => {
  close(scorePosture(delta(0, { headForward: 0.2, torsoForward: 0.1, neckSlump: 0.3 }), neck).deviation, 0.215);
  close(scorePosture(delta(0, { shoulderTilt: 0.2, shoulderShrug: 0.1 }), shoulder).deviation, 0.17);
  close(Object.values(NECK_WEIGHTS).reduce((a,b) => a+b), 1);
  close(Object.values(SHOULDER_WEIGHTS).reduce((a,b) => a+b), 1);
});
test('yaw boundary suppresses only head-forward penalty, without redistributing its weight', () => {
  const sample = delta(0, { headForward: 0.4, torsoForward: 0.2, neckSlump: 0.2 });
  close(scorePosture({ ...sample, yawRatio: 0.15 }, neck).deviation, 0.27);
  close(scorePosture({ ...sample, yawRatio: 0.15 + 1e-9 }, neck).deviation, 0.13);
  close(scorePosture(delta(0.2, { yawRatio: 1 }), shoulder).deviation, 0.2);
});
test('full and zero credit boundaries, linear midpoint and adjacent values', () => {
  for (const policy of policies) {
    const a = policy.fullCreditDelta, b = policy.zeroCreditDelta;
    close(scorePosture(delta(a), policy).score, 100);
    assert.ok(scorePosture(delta(a + 1e-8), policy).score < 100);
    close(scorePosture(delta((a+b)/2), policy).score, 50);
    assert.ok(scorePosture(delta(b - 1e-8), policy).score > 0);
    close(scorePosture(delta(b), policy).score, 0);
    close(scorePosture(delta(b+1), policy).score, 0);
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
test('parts are independent and inputs are deterministic and immutable', () => {
  const sample = Object.freeze(delta(0.1234));
  for (const policy of policies) {
    const before = structuredClone({ sample, policy });
    assert.deepEqual(scorePosture(sample, policy), scorePosture(sample, policy));
    assert.deepEqual({ sample, policy }, before);
    assert.ok(Object.isFrozen(policy.weights));
  }
  assert.equal(scorePosture(delta(0, { shoulderTilt: 100, shoulderShrug: NaN }), neck).score, 100);
  assert.equal(scorePosture(delta(0, { headForward: 100, torsoForward: NaN, neckSlump: NaN }), shoulder).score, 100);
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
test('tuning weights creates a different persisted policy version', () => {
  assert.match(neck.version, /^upper-body-neck-v2-/);
  assert.match(shoulder.version, /^upper-body-shoulder-v2-/);
  assert.notEqual(scoreSettingsVersion('neck', { ...NECK_WEIGHTS, headForward: 0.6 }, NECK_LIMITS), neck.version);
});
