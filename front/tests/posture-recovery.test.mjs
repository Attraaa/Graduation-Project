import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceObservation, createObservation } from '../src/features/posture/observation.ts';
import { advanceEvaluation, createEvaluation } from '../src/features/posture/evaluation.ts';
import { scorePosture } from '../src/features/posture/scoring.ts';
import { turtleScorePolicy as neck } from '../src/features/posture/modes/turtle.ts';
import { shoulderScorePolicy as shoulder } from '../src/features/posture/modes/shoulder.ts';
import { MOTION_PROTECTION } from '../src/features/posture/scoreSettings.ts';
import { CaptureRecorder } from '../../database/recorder.ts';
import { MemoryRecords } from './fixtures/memory-records.mjs';
import { sampleBatch } from './fixtures/record-batch.mjs';

const policies = [neck, shoulder];
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const reference = { schemaVersion: 2, sourceId: 'camera', widthPx: 1000, heightPx: 1000,
  startedAtMs: 0, completedAtMs: 0, sampleCount: 31, baseEarSpanPx: 200, baseShoulderSpanPx: 500,
  baseEarHeightPx: 250, metrics: { earOffsetShoulderWidths: 0, earHeightShoulderWidths: .5, shoulderHeightDifferenceShoulderWidths: 0 } };

function frame(at, { span = 280, earY = .35, shoulderY = .5, noseOffset = 0, visibility = 1, translateY = 0 } = {}) {
  const landmarks = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 1 }));
  landmarks[0] = { x: .5 + noseOffset, y: earY + translateY, visibility };
  landmarks[7] = { x: .5 + span / 2000, y: earY + translateY, visibility: 1 };
  landmarks[8] = { x: .5 - span / 2000, y: earY + translateY, visibility: 1 };
  landmarks[11] = { x: .75, y: shoulderY + translateY, visibility: 1 };
  landmarks[12] = { x: .25, y: shoulderY + translateY, visibility: 1 };
  return { landmarks, widthPx: 1000, heightPx: 1000, sourceId: 'camera', timestampMs: at };
}

function replay() {
  let observation = createObservation(), evaluations = policies.map(createEvaluation);
  return (at, geometry) => {
    observation = advanceObservation(observation, reference, frame(at, geometry));
    evaluations = evaluations.map((state, index) => advanceEvaluation(state, observation, policies[index]));
    return { observation, evaluations };
  };
}

test('turning left or right suspends both scores and averages; frontal reacquisition keeps the prior score', () => {
  for (const direction of [-1, 1]) {
    const feed = replay(); let before;
    for (let at = 0; at <= 6000; at += 100) before = feed(at);
    assert.ok(before.evaluations.every(state => state.currentScore < 100));
    for (let at = 6100; at <= 8000; at += 100) {
      const turned = feed(at, { noseOffset: direction * .06 });
      assert.equal(turned.observation.reason, 'head-turned');
      close(turned.observation.observedSeconds, before.observation.observedSeconds);
      turned.evaluations.forEach((state, index) => {
        assert.equal(state.currentScore, null); assert.equal(state.currentDeviation, null);
        close(state.validMs, before.evaluations[index].validMs);
        close(state.scoreTimeSum, before.evaluations[index].scoreTimeSum);
        close(state.averageScore, before.evaluations[index].averageScore);
      });
    }
    const returned = feed(8100);
    returned.evaluations.forEach((state, index) => {
      close(state.currentScore, before.evaluations[index].currentScore);
      close(state.validMs, before.evaluations[index].validMs);
      assert.equal(state.continuousMs, 0);
    });
  }
});

test('missing landmarks, duplicate timestamps and long gaps cannot reset either score to one hundred', () => {
  for (const interruption of ['missing', 'duplicate', 'long-gap']) {
    const feed = replay(); let before;
    for (let at = 0; at <= 6000; at += 100) before = feed(at);
    if (interruption === 'missing') feed(6100, { visibility: .5 });
    if (interruption === 'duplicate') feed(6000);
    const returned = feed(interruption === 'long-gap' ? 7000 : 6200);
    returned.evaluations.forEach((state, index) => {
      close(state.currentScore, before.evaluations[index].currentScore);
      close(state.validMs, before.evaluations[index].validMs);
      close(state.scoreTimeSum, before.evaluations[index].scoreTimeSum);
    });
  }
});

test('a brief apparent return to reference cannot raise the score; a stable frontal return can', () => {
  const feed = replay(); let lowered;
  for (let at = 0; at <= 6000; at += 100) lowered = feed(at);
  const normal = { span: 200, earY: .25 };
  const brief = feed(6500, normal);
  brief.evaluations.forEach((state, index) => close(state.currentScore, lowered.evaluations[index].currentScore));
  const interrupted = feed(6600, { ...normal, noseOffset: .05 });
  assert.ok(interrupted.evaluations.every(state => state.currentScore === null));
  const first = feed(6700, normal);
  first.evaluations.forEach((state, index) => close(state.currentScore, lowered.evaluations[index].currentScore));
  let stable;
  for (let at = 6800; at < 6700 + MOTION_PROTECTION.recoveryMs; at += 100) {
    stable = feed(at, normal);
    assert.ok(stable.evaluations.every(state => state.currentScore < 100));
  }
  stable = feed(6700 + MOTION_PROTECTION.recoveryMs, normal);
  assert.ok(stable.evaluations.every(state => state.currentScore === 100));
});

test('shoulder elevation and lowering use the same relative deviation and greater vertical sensitivity', () => {
  for (const shoulderY of [.45, .55]) {
    const sample = advanceObservation(createObservation(), reference, frame(0, { span: 200, earY: .25, shoulderY }));
    close(sample.delta.shoulderShrug, .1);
    close(scorePosture(sample.delta, shoulder).score, 95);
  }
  const translated = advanceObservation(createObservation(), reference, frame(0, { span: 200, earY: .25, translateY: .1 }));
  close(translated.delta.shoulderShrug, 0);
  close(scorePosture(translated.delta, shoulder).score, 100);
  const tilted = { ...translated.delta, shoulderTilt: .1 };
  close(scorePosture(tilted, shoulder).deviation, .07);
});

test('turning intervals remain excluded from persisted scores and old policy records survive', () => {
  const feed = replay();
  const captures = policies.map(policy => new CaptureRecorder({ ...sampleBatch().record, id: `recovery:${policy.mode}`,
    mode: policy.mode, scorePolicyVersion: policy.version, habitPolicyVersion: createEvaluation(policy).habitPolicyVersion }, 0));
  let latest, beforeTurn;
  for (let at = 0; at <= 10000; at += 100) {
    latest = feed(at, at > 6000 && at <= 8000 ? { noseOffset: .06 } : {});
    captures.forEach((capture, index) => capture.sample(at, latest.evaluations[index]));
    if (at === 6000) beforeTurn = latest;
    if (at === 8000) latest.evaluations.forEach((state, index) => close(state.validMs, beforeTurn.evaluations[index].validMs));
  }
  const db = new MemoryRecords();
  {
    const old = sampleBatch(); old.record.scorePolicyVersion = 'upper-body-neck-v2-old'; db.write(old);
    captures.forEach((capture, index) => {
      capture.finish(10000); db.write(capture.batch(0));
      const stored = db.detail('demo', capture.record.id).record;
      for (const field of ['validMs', 'scoreTimeSum', 'deviationMs', 'deviationEpisodeCount', 'longestContinuousMs'])
        close(stored[field], latest.evaluations[index][field]);
      assert.ok(stored.validMs < stored.runMs);
      assert.match(stored.scorePolicyVersion, /-v3-/);
    });
    assert.equal(db.detail('demo', old.record.id).record.scorePolicyVersion, 'upper-body-neck-v2-old');
  }
});
