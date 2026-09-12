import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePress } from '../src/features/keyboard/evaluatePress.ts';
import { ANSI_QWERTY_TOUCH_POLICY_V1 } from '../src/features/keyboard/fingerPolicy.ts';
import { adaptRuntimePress } from '../src/features/keyboard/runtime.ts';

const options = {
  minKeyboardConfidence: 0.7,
  minFingerConfidence: 0.7,
  maxAbsoluteFrameDeltaMs: 100,
  maxNormalizedDistanceToTarget: 0.8,
  ambiguityNormalizedDistance: 0.1,
};

const candidate = (hand, finger, overrides = {}) => ({
  hand,
  finger,
  confidence: 0.95,
  normalizedDistanceToTarget: 0.1,
  insideTarget: true,
  ...overrides,
});

const observation = (code, candidates, overrides = {}) => ({
  code,
  keyboardConfidence: 0.95,
  frameDeltaMs: 10,
  candidates,
  ...overrides,
});

test('uses physical key codes for the conventional Q, A and Z left-pinky column', () => {
  for (const code of ['KeyQ', 'KeyA', 'KeyZ']) {
    const result = evaluatePress(
      observation(code, [candidate('left', 'pinky')]),
      ANSI_QWERTY_TOUCH_POLICY_V1,
      options,
    );
    assert.equal(result.verdict, 'preferred');
    assert.equal(result.observed, 'left:pinky');
  }
});

test('distinguishes an approved alternative from a mismatched finger', () => {
  const acceptable = evaluatePress(
    observation('KeyB', [candidate('right', 'index')]),
    ANSI_QWERTY_TOUCH_POLICY_V1,
    options,
  );
  assert.equal(acceptable.verdict, 'acceptable');

  const mismatch = evaluatePress(
    observation('KeyQ', [candidate('left', 'ring')]),
    ANSI_QWERTY_TOUCH_POLICY_V1,
    options,
  );
  assert.equal(mismatch.verdict, 'mismatch');
});

test('allows either thumb for Space', () => {
  for (const hand of ['left', 'right']) {
    const result = evaluatePress(
      observation('Space', [candidate(hand, 'thumb')]),
      ANSI_QWERTY_TOUCH_POLICY_V1,
      options,
    );
    assert.equal(result.verdict, 'preferred');
  }
});

test('uncertain perception never becomes a mismatch', () => {
  const uncertain = [
    observation('KeyQ', [candidate('left', 'ring')], { keyboardConfidence: 0.4 }),
    observation('KeyQ', [candidate('left', 'ring')], { frameDeltaMs: 150 }),
    observation('KeyQ', [candidate('left', 'ring', { confidence: 0.4 })]),
    observation('KeyQ', [candidate('left', 'ring', {
      insideTarget: false,
      normalizedDistanceToTarget: 1.2,
    })]),
    observation('Digit1', [candidate('left', 'pinky')]),
  ];

  for (const value of uncertain) {
    assert.equal(
      evaluatePress(value, ANSI_QWERTY_TOUCH_POLICY_V1, options).verdict,
      'unknown',
    );
  }
});

test('similar candidates are unknown instead of forcing the nearest finger', () => {
  const result = evaluatePress(
    observation('KeyQ', [
      candidate('left', 'pinky', { normalizedDistanceToTarget: 0.12 }),
      candidate('left', 'ring', { normalizedDistanceToTarget: 0.18 }),
    ]),
    ANSI_QWERTY_TOUCH_POLICY_V1,
    options,
  );
  assert.equal(result.verdict, 'unknown');
  assert.equal(result.reason, 'ambiguous-candidates');
});

test('adapts the Python perception payload and keeps the policy decision in the app', () => {
  const result = adaptRuntimePress({
    ok: true,
    key_event: { key: 'Q', code: 'KeyQ', sequence: 7 },
    frame_delta_ms: -24,
    pressed_key: 'Q',
    pressed_finger: { hand: 'Left', finger: 'pinky', x: 5, y: 5, score: 0.95 },
    finger_keys: [{
      hand: 'Left', finger: 'pinky', x: 5, y: 5, score: 0.95,
      key: 'Q', matches_pressed_key: true, distance_to_pressed_key_center: 1,
    }],
    keyboard: {
      ok: true,
      quality: { min_confidence: 0.9 },
      keys: { Q: [[0, 0], [10, 0], [10, 10], [0, 10]] },
      size: [100, 50],
    },
  });

  assert.equal(result.observedFinger, 'left:pinky');
  assert.equal(result.evaluation.verdict, 'preferred');
  assert.equal(result.evaluation.policyVersion, '1.0.0');
});
