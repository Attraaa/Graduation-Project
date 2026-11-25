import assert from 'node:assert/strict';
import test from 'node:test';
import { BALANCE, balanceAngles, balanceDeviation, balancePolicy, balanceReference, balanceScore, balanceScorePolicy, balanceTiltDeg, headAngles,
  isCurrentBalancePolicy, normalizeBalanceSensitivity } from '../src/features/posture/modes/balance.ts';
import { NECK_MAX_YAW_DEG } from '../src/features/posture/modes/turtle.ts';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const rad = deg => deg * Math.PI / 180;
/** Column-major 4×4 head matrix R = Rz(roll) · Ry(yaw), like the face landmarker's transformation matrix. */
function matrix(rollDeg = 0, yawDeg = 0) {
  const [cr, sr, cy, sy] = [Math.cos(rad(rollDeg)), Math.sin(rad(rollDeg)), Math.cos(rad(yawDeg)), Math.sin(rad(yawDeg))];
  const R = [[cr * cy, -sr, cr * sy], [sr * cy, cr, sr * sy], [-sy, 0, cy]];
  const f = Array(16).fill(0); f[15] = 1;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) f[4 * c + r] = R[r][c];
  return f;
}
/** Pose points 0–12 with both shoulders `tiltDeg` off level (y down), image 1280×720; mirrored swaps left and right. */
function pose(tiltDeg = 0, { visibility = 1, mirrored = false } = {}) {
  const points = Array.from({ length: 13 }, () => [0.5, 0.4, 0, 1]);
  const dx = 0.2, dy = 2 * dx * 1280 / 720 * Math.tan(rad(tiltDeg));
  const left = [0.5 + dx, 0.7 + dy / 2, 0, visibility], right = [0.5 - dx, 0.7 - dy / 2, 0, 1];
  points[11] = mirrored ? [1 - left[0], left[1], 0, left[3]] : left;
  points[12] = mirrored ? [1 - right[0], right[1], 0, 1] : right;
  return points;
}
const frame = (rollDeg, shoulderDeg, extra = {}) => ({ t: 0, face: null, imageW: 1280, imageH: 720,
  fmat: rollDeg === null ? null : matrix(rollDeg, extra.yawDeg ?? 0), pose: pose(shoulderDeg, extra) });

test('head roll and yaw come from the head matrix with the same yaw formula as the neck model', () => {
  for (const [roll, yaw] of [[0, 0], [7.5, 0], [-12, 10], [3, -20]]) {
    const angles = headAngles(matrix(roll, yaw));
    close(angles.rollDeg, roll); close(angles.yawDeg, yaw);
  }
});

test('the head is measured only within the neck model\'s 25° turn; shoulders only when both are clearly visible', () => {
  assert.equal(balanceAngles(frame(5, 0, { yawDeg: NECK_MAX_YAW_DEG + 1 })).headRollDeg, null);
  close(balanceAngles(frame(5, 0, { yawDeg: NECK_MAX_YAW_DEG - 0.1 })).headRollDeg, 5);
  assert.equal(balanceAngles(frame(null, 0)).headRollDeg, null);
  assert.equal(balanceAngles(frame(0, 4, { visibility: BALANCE.minShoulderVisibility - 0.01 })).shoulderDeg, null);
  close(balanceAngles(frame(0, 4)).shoulderDeg, 4, 1e-6);
  // The shoulder line keeps its slope whichever shoulder is on the left of the image.
  close(balanceAngles(frame(0, 4, { mirrored: true })).shoulderDeg, -4, 1e-6);
  assert.equal(balanceAngles({ ...frame(0, 0), pose: null }).shoulderDeg, null);
});

test('the reference is the median of the 5 s frames, and needs at least half of them (and 3)', () => {
  const frames = [2, 3, 2.5, 40, 2, 3].map(roll => frame(roll, 1));
  const reference = balanceReference(frames);
  close(reference.headRollDeg, 2.75); close(reference.shoulderDeg, 1, 1e-6);
  const fewFaces = [frame(2, 1), frame(null, 1), frame(null, 1), frame(null, 1)];
  assert.deepEqual(balanceReference(fewFaces).headRollDeg, null);
  const hiddenShoulders = [1, 2, 3, 4].map(roll => frame(roll, 0, { visibility: 0.2 }));
  assert.equal(balanceReference(hiddenShoulders).shoulderDeg, null);
  assert.equal(balanceReference([frame(1, 0), frame(1, 0)]).headRollDeg, null);
});

test('tilt is the larger of head and shoulder-line change, needs the head, and wraps around 180°', () => {
  const reference = { headRollDeg: 2, shoulderDeg: 1 };
  close(balanceTiltDeg({ headRollDeg: 10, shoulderDeg: 3 }, reference), 8);
  close(balanceTiltDeg({ headRollDeg: 4, shoulderDeg: 13 }, reference), 12);
  close(balanceTiltDeg({ headRollDeg: -6, shoulderDeg: null }, reference), 8);
  close(balanceTiltDeg({ headRollDeg: 4, shoulderDeg: 13 }, { headRollDeg: 2, shoulderDeg: null }), 2);
  assert.equal(balanceTiltDeg({ headRollDeg: null, shoulderDeg: 20 }, reference), null);
  assert.equal(balanceTiltDeg({ headRollDeg: 5, shoulderDeg: 1 }, { headRollDeg: null, shoulderDeg: 1 }), null);
  close(balanceTiltDeg({ headRollDeg: -179, shoulderDeg: null }, { headRollDeg: 179, shoulderDeg: null }), 2);
});

test('3° or less is 100, 18° or more is 0, straight in between; habits use the neck\'s conversion', () => {
  assert.deepEqual([0, 3, 10.5, 18, 30].map(tilt => balanceScore(tilt)), [100, 100, 50, 0, 0]);
  close(balanceScore(7.5), 70);
  close(balanceDeviation(70), 0.15); close(balanceDeviation(80), 0.1);
  assert.match(balanceScorePolicy.version, /^upper-body-balance-v1-[0-9a-z]+$/);
  assert.equal(balanceScorePolicy.mode, 'balance');
});

test('좌우 균형 민감도: 50% keeps 3°/18° and the ID; each 10%p scales both angles by a tenth and marks the ID', () => {
  assert.equal(balancePolicy(50).version, balanceScorePolicy.version);
  assert.deepEqual([balanceScorePolicy.fullDeg, balanceScorePolicy.zeroDeg], [3, 18]);
  for (const [sensitivity, fullDeg, zeroDeg, seventy] of [[100, 1.5, 9, 3.75], [70, 2.4, 14.4, 6], [10, 4.2, 25.2, 10.5]]) {
    const policy = balancePolicy(sensitivity);
    assert.deepEqual([policy.fullDeg, policy.zeroDeg], [fullDeg, zeroDeg]);
    assert.equal(policy.version, `${balanceScorePolicy.version}:s${sensitivity}`);
    close(balanceScore(seventy, policy), 70);
  }
  // A more sensitive setting gives a lower score for the same tilt.
  assert.ok(balanceScore(6, balancePolicy(80)) < balanceScore(6) && balanceScore(6) < balanceScore(6, balancePolicy(20)));
  for (const [input, value] of [[73, 70], ['30', 30], [5, 10], [400, 100], [NaN, 50], ['', 50], [null, 50], ['abc', 50]]) assert.equal(normalizeBalanceSensitivity(input), value);
  for (const sensitivity of [10, 50, 70, 100]) assert.equal(isCurrentBalancePolicy(balancePolicy(sensitivity).version), true);
  for (const version of [`${balanceScorePolicy.version}:s50`, `${balanceScorePolicy.version}:s75`, 'upper-body-shoulder-v3-abc', '']) assert.equal(isCurrentBalancePolicy(version), false);
});
