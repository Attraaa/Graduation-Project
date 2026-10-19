import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { advanceTrunkTracker, classifyTrunk, createTrunkTracker, trunkFeatures, trunkProbabilities } from '../src/features/posture/trunkClassifier.ts';
import { trunkModel } from '../src/features/posture/trunkModel.ts';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
const image = () => Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 1 }));
function world(features = [0, -1.2, 0, 0, -.4, -.1, 0]) {
  const points = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
  points[11] = { x: .2, y: 0, z: 0 }; points[12] = { x: -.2, y: 0, z: 0 };
  points[0] = { x: features[3] * .4, y: features[4] * .4, z: features[5] * .4 };
  points[23] = { x: -features[0] * .4, y: -features[1] * .4, z: -features[2] * .4 };
  points[24] = { ...points[23] };
  return points;
}

test('browser inference matches independent Python exported predictions', () => {
  const parity = JSON.parse(readFileSync(new URL('./fixtures/trunk-parity.json', import.meta.url)));
  parity.features.forEach((features, i) => trunkProbabilities(features).forEach((value, j) => close(value, parity.probabilities[i][j])));
});

test('world features are translation, scale and mirror invariant with documented joint ordering', () => {
  const original = world(), expected = [0, -1.2, 0, 0, -.4, -.1, 0];
  trunkFeatures(original).forEach((value, i) => close(value, expected[i]));
  for (const scale of [.5, 1, 2]) for (const mirror of [-1, 1]) {
    const moved = original.map(p => ({ x: mirror * p.x * scale + 2, y: p.y * scale + 3, z: p.z * scale + 4 }));
    trunkFeatures(moved).forEach((value, i) => close(value, expected[i]));
  }
});

test('hidden hips, absent depth, invalid values and unfamiliar geometry cause abstention', () => {
  const hidden = image(); hidden[23].visibility = .79;
  assert.equal(classifyTrunk(hidden, world()).reason, 'missing-landmarks');
  const crop = image(); crop[24].y = 1.1;
  assert.equal(classifyTrunk(crop, world()).label, null);
  assert.equal(classifyTrunk(image(), undefined).label, null);
  const bad = world(); bad[11].z = NaN;
  assert.equal(classifyTrunk(image(), bad).label, null);
  assert.equal(classifyTrunk(image(), world([0, -20, 0, 0, -.4, -.1, 0])).reason, 'out-of-domain');
  assert.equal(trunkProbabilities([1, 2, NaN]), null);
  assert.equal(trunkModel.usage, 'bounded-auxiliary');
});

test('classifier confirms a stable result and immediately clears it at a gap, pause or changed label', () => {
  const current = { label: 'forward', reason: null };
  let state = createTrunkTracker();
  for (let at = 0; at < 1000; at += 100) {
    state = advanceTrunkTracker(state, current, at); assert.equal(state.estimate.label, null);
  }
  state = advanceTrunkTracker(state, current, 1000); assert.equal(state.estimate.label, 'forward');
  for (const [estimate, at] of [[current, 1501], [{ label: 'upright', reason: null }, 1100], [{ label: null, reason: 'uncertain' }, 1100]]) {
    const next = advanceTrunkTracker(state, estimate, at); assert.equal(next.estimate.label, null);
  }
  const reversed = advanceTrunkTracker(state, current, 900);
  assert.equal(reversed.estimate.label, null); assert.equal(reversed.lastAt, 1000);
  assert.equal(advanceTrunkTracker(createTrunkTracker(), current, 1100).estimate.label, null);
});
