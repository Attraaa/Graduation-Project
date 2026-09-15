import assert from 'node:assert/strict';
import test from 'node:test';
import { scorePosture } from '../src/features/posture/scoring.ts';
import { turtleScorePolicy } from '../src/features/posture/modes/turtle.ts';
import { shoulderScorePolicy } from '../src/features/posture/modes/shoulder.ts';

const policies = [turtleScorePolicy, shoulderScorePolicy];

function delta(value = 0, overrides = {}) {
  return {
    noseOffsetShoulderWidths: value,
    noseHeightShoulderWidths: value,
    shoulderHeightDifferenceShoulderWidths: value,
    ...overrides,
  };
}

test('identical inputs produce identical scores without mutating the input or policy', () => {
  const input = Object.freeze(delta(0.1234));
  for (const policy of policies) {
    const before = structuredClone({ input, policy });
    assert.deepEqual(scorePosture(input, policy), scorePosture(input, policy));
    assert.deepEqual({ input, policy }, before);
    assert.ok(Object.isFrozen(policy));
    assert.ok(Object.isFrozen(policy.metrics));
  }
});

test('missing input differs from both a matching reference and a measured zero score', () => {
  for (const policy of policies) {
    assert.deepEqual(scorePosture(null, policy), {
      scorePolicyVersion: policy.version, score: null, deviation: null,
    });
    assert.equal(scorePosture(delta(0), policy).score, 100);
    assert.deepEqual(scorePosture(delta(0.30), policy), {
      scorePolicyVersion: policy.version, score: 0, deviation: 0.30,
    });
    for (const metric of policy.metrics) {
      for (const missing of [NaN, Infinity, -Infinity, undefined]) {
        assert.deepEqual(scorePosture(delta(0, { [metric]: missing }), policy), scorePosture(null, policy));
      }
    }
  }
});

test('positive and negative projected deviations have symmetric scores', () => {
  for (const policy of policies) {
    for (const value of [0, 0.05, 0.1234, 0.175, 0.30, 1]) {
      assert.deepEqual(scorePosture(delta(value), policy), scorePosture(delta(-value), policy));
    }
  }
});

test('full-credit and zero-credit boundaries include exact values and exclude adjacent values', () => {
  const epsilon = 1e-9;
  for (const policy of policies) {
    assert.equal(scorePosture(delta(0.05 - epsilon), policy).score, 100);
    assert.equal(scorePosture(delta(0.05), policy).score, 100);
    const belowFull = scorePosture(delta(0.05 + epsilon), policy).score;
    assert.ok(belowFull < 100 && belowFull > 99.999);
    const aboveZero = scorePosture(delta(0.30 - epsilon), policy).score;
    assert.ok(aboveZero > 0 && aboveZero < 0.001);
    assert.equal(scorePosture(delta(0.30), policy).score, 0);
    assert.equal(scorePosture(delta(0.30 + epsilon), policy).score, 0);
  }
});

test('scores interpolate linearly and preserve precision until aggregation or display', () => {
  for (const policy of policies) {
    assert.equal(scorePosture(delta(0.175), policy).score, 50);
    assert.ok(Math.abs(scorePosture(delta(0.1234), policy).score - 70.64) < 1e-12);
  }
});

test('turtle mode evaluates the largest nose change and ignores the shoulder metric', () => {
  const input = delta(0, { noseOffsetShoulderWidths: -0.10, noseHeightShoulderWidths: 0.175 });
  assert.deepEqual(scorePosture(input, turtleScorePolicy), {
    scorePolicyVersion: turtleScorePolicy.version, score: 50, deviation: 0.175,
  });
  assert.equal(scorePosture(delta(0, { noseOffsetShoulderWidths: -0.175 }), turtleScorePolicy).score, 50);
  for (const ignored of [0, 1, -1, NaN, Infinity]) {
    assert.deepEqual(
      scorePosture({ ...input, shoulderHeightDifferenceShoulderWidths: ignored }, turtleScorePolicy),
      scorePosture(input, turtleScorePolicy),
    );
  }
});

test('shoulder mode evaluates shoulder height difference and ignores both nose metrics', () => {
  const input = delta(0, { shoulderHeightDifferenceShoulderWidths: -0.175 });
  assert.deepEqual(scorePosture(input, shoulderScorePolicy), {
    scorePolicyVersion: shoulderScorePolicy.version, score: 50, deviation: 0.175,
  });
  for (const ignored of [0, 1, -1, NaN, Infinity]) {
    assert.deepEqual(
      scorePosture({ ...input, noseOffsetShoulderWidths: ignored, noseHeightShoulderWidths: ignored }, shoulderScorePolicy),
      scorePosture(input, shoulderScorePolicy),
    );
  }
  assert.equal(scorePosture(delta(0, { noseOffsetShoulderWidths: 1 }), shoulderScorePolicy).score, 100);
  assert.equal(scorePosture(delta(0, { shoulderHeightDifferenceShoulderWidths: 1 }), turtleScorePolicy).score, 100);
});

test('increasing deviation never increases the score and scores stay within 0 to 100', () => {
  for (const policy of policies) {
    let previous = 100;
    for (let step = 0; step <= 1000; step += 1) {
      const result = scorePosture(delta(step / 1000), policy);
      assert.ok(result.score >= 0 && result.score <= previous);
      previous = result.score;
    }
  }
});

test('mode policies keep independent versions and do not emit diagnosis or misuse classifications', () => {
  assert.equal(turtleScorePolicy.version, 'reference-similarity-turtle-v1');
  assert.equal(shoulderScorePolicy.version, 'reference-similarity-shoulder-v1');
  assert.equal(turtleScorePolicy.mode, 'turtle');
  assert.equal(shoulderScorePolicy.mode, 'shoulder');
  for (const policy of policies) {
    for (const input of [null, delta(0), delta(1)]) {
      const result = scorePosture(input, policy);
      assert.equal(result.scorePolicyVersion, policy.version);
      for (const key of ['diagnosis', 'isCorrect', 'isResting', 'misuse']) assert.equal(key in result, false);
    }
  }
});
