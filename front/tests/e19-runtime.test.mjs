// E19 neck model runtime (features/posture/e19) and neck policy (modes/turtle.ts).
// The ONNX session is a fake here so calibration rules can be checked exactly; the real model is checked by
// fhp-e19-parity.test.mjs and, when the local fixtures exist, by the smoke test at the end.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { createNeckModel } from '../src/features/posture/e19/model.ts';
import { advanceNeckFlow, breakNeckClock, createOneEuro, finishNeckFlow, NECK_FLOW, neckSecondsLeft, referenceFailure, startNeckClock, startNeckFlow, tickNeckClock } from '../src/features/posture/e19/flow.ts';
import { createFaceBuffer, neckFrame } from '../src/features/posture/e19/frame.ts';
import { appNeckConfig, BASE_CVA, estimatedCva, NECK_MAX_YAW_DEG, neckDeviation, neckLoadPct, neckScore, turtleScorePolicy } from '../src/features/posture/modes/turtle.ts';
import { HABIT_POLICY } from '../src/features/posture/evaluation.ts';

const config = JSON.parse(readFileSync(new URL('../public/models/fhp-e19/config.json', import.meta.url), 'utf8'));
const close = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
class Tensor { constructor(type, data, dims) { Object.assign(this, { type, data, dims }); } }
// Fake E19: neck Δ = 100 × (nose x − reference nose x), load = 1000 × (nose y − reference nose y), head pitch = 100 × nose z.
function fakeModel(cfg = config, beforeRun = () => {}) {
  const feeds = [];
  const session = { run: async input => {
    feeds.push(input);
    await beforeRun();
    const p = input.pose.data, r = input.ref_pose.data;
    return { delta_deg: { data: Float32Array.of((p[0] - r[0]) * 100) }, load_pct: { data: Float32Array.of((p[1] - r[1]) * 1000) },
      psi_deg: { data: Float32Array.of(p[2] * 100) }, scale: { data: Float32Array.of(1, 1, 1) } };
  } };
  return { model: createNeckModel({ Tensor }, session, cfg), feeds };
}
function frame(t, { x = 0.5, y = 0.4, z = 0, visibility = 1, face = true, yaw = 0, faceX = x } = {}) {
  const pose = Array.from({ length: 13 }, () => [0.5, 0.5, 0, visibility]);
  pose[0] = [x, y, z, visibility]; pose[11] = [0.65, 0.7, 0, visibility]; pose[12] = [0.35, 0.7, 0, visibility];
  const mesh = Array.from({ length: 478 }, () => [0.5, 0.45, 0]); mesh[1] = [faceX, y, 0];
  const r = yaw * Math.PI / 180, fmat = Array(16).fill(0);
  fmat[0] = 1; fmat[5] = 1; fmat[15] = 1; fmat[2] = -Math.sin(r); fmat[10] = Math.cos(r);
  return { t, pose, face: face ? mesh : null, fmat: face ? fmat : null, imageW: 1280, imageH: 720 };
}
const upright = (n = 50, options = {}) => Array.from({ length: n }, (_, i) => frame(i * 100, { x: 0.5 + (i % 2 ? 0.001 : -0.001), z: 0.02, ...options }));

test('before calibration E19 gives no score (no fallback model); quality checks come first', async () => {
  const { model } = fakeModel();
  assert.deepEqual(await model.infer(frame(0)), { measuring: false, reason: 'uncalibrated' });
  assert.deepEqual(await model.infer({ ...frame(0), pose: null }), { measuring: false, reason: 'no_pose' });
  assert.deepEqual(await model.infer(frame(0, { visibility: 0.4 })), { measuring: false, reason: 'low_visibility' });
  assert.equal(model.calibrated(), false);
});

test('5-s calibration sets the reference and offsets; scores are 100 × clip(Δ / 40°) and 100 × clip(load / 150 %)', async () => {
  const { model } = fakeModel();
  const info = await model.calibrate(upright());
  assert.equal(info.ok, true); close(info.offsetDeg, 0); close(info.psiOffsetDeg, 2); assert.equal(info.clipped, false);
  assert.equal(model.calibrated(), true);
  const same = await model.infer(frame(0, { z: 0.02 }));
  assert.equal(same.measuring, true); close(same.deltaDeg, 0); close(same.scoreNeck, 0); close(same.psiRelDeg, 0);
  const forward = await model.infer(frame(0, { x: 0.6, z: 0.02 }));
  close(forward.deltaDeg, 10); close(forward.scoreNeck, 25);
  close((await model.infer(frame(0, { x: 1.0 }))).scoreNeck, 100);
  close((await model.infer(frame(0, { x: 0.45 }))).scoreNeck, 0);
  const load = await model.infer(frame(0, { y: 0.46 }));
  close(load.loadPct, 60, 1e-3); close(load.scoreLoad, 40, 1e-3);
});

test('the three calibration failures: too few frames with face and shoulders, movement, head pitch over 12°', async () => {
  const { model } = fakeModel();
  const withoutFace = count => upright().map((x, i) => i < count ? { ...x, face: null, fmat: null } : x);
  assert.deepEqual(await model.calibrate(withoutFace(11)), { ok: false, reason: 'too_few_frames' });
  assert.equal(model.calibrated(), false);
  assert.equal((await model.calibrate(withoutFace(10))).ok, true);
  assert.deepEqual(await model.calibrate([]), { ok: false, reason: 'too_few_frames' });
  assert.deepEqual(await model.calibrate(upright().map((x, i) => frame(x.t, { x: i % 2 ? 0.45 : 0.55 }))), { ok: false, reason: 'unstable' });
  assert.deepEqual(await model.calibrate(upright(50, { z: 0.125 })), { ok: false, reason: 'not_upright' });
  assert.deepEqual(await model.infer(frame(0)), { measuring: false, reason: 'uncalibrated' });
  assert.equal((await model.calibrate(upright(50, { z: 0.115 }))).ok, true);
});

test('a calculation from an earlier camera generation cannot clear or replace the new reference', async () => {
  for (const blockedCall of [1, 8]) {
    const gate = Promise.withResolvers(), entered = Promise.withResolvers();
    let calls = 0, current = true;
    const { model } = fakeModel(config, () => {
      if (++calls === blockedCall) { entered.resolve(); return gate.promise; }
    });
    const stale = model.calibrate(upright(5, { y: 0.38 }), () => current);
    await entered.promise;
    current = false; model.clear();
    const updated = await model.calibrate(upright(5, { y: 0.43 }));
    assert.equal(updated.ok, true);
    gate.resolve();
    assert.equal((await stale).ok, false);
    assert.equal(model.calibrated(), true);
    close((await model.infer(frame(0, { y: 0.43 }))).loadPct, 0);
  }
});

test('a head turned over 35° stops measuring; a missing or far face still measures without the face', async () => {
  const { model, feeds } = fakeModel();
  await model.calibrate(upright());
  assert.deepEqual(await model.infer(frame(0, { yaw: 36 })), { measuring: false, reason: 'head_turned' });
  const turned = await model.infer(frame(0, { yaw: 34 }));
  assert.equal(turned.measuring, true); close(turned.yawDeg, 34);
  const noFace = await model.infer(frame(0, { face: false }));
  assert.equal(noFace.measuring, true); assert.equal(noFace.faceUsed, false); assert.equal(feeds.at(-1).face_ok.data[0], 0);
  const other = await model.infer(frame(0, { faceX: 0.85, yaw: 60 }));
  assert.equal(other.measuring, true); assert.equal(other.faceUsed, false);
});

test('the app lowers only the head-turn limit to 25° (package config stays 35°, same model)', async () => {
  const { model } = fakeModel(appNeckConfig(config));
  await model.calibrate(upright());
  assert.equal(NECK_MAX_YAW_DEG, 25); assert.equal(config.qc.max_abs_yaw_deg, 35);
  assert.deepEqual(await model.infer(frame(0, { yaw: 26 })), { measuring: false, reason: 'head_turned' });
  assert.equal((await model.infer(frame(0, { yaw: 24 }))).measuring, true);
  assert.deepEqual(appNeckConfig(config), { ...config, qc: { ...config.qc, max_abs_yaw_deg: 25 } });
});

test('neck observed time adds gaps up to 500 ms between measured results and restarts after a break', () => {
  let clock = tickNeckClock(startNeckClock(), 1000);
  assert.equal(clock.seconds, 0);
  clock = tickNeckClock(clock, 1100); close(clock.seconds, 0.1);
  clock = tickNeckClock(clock, 1600); close(clock.seconds, 0.6);
  clock = tickNeckClock(clock, 2101); close(clock.seconds, 0.6);
  clock = tickNeckClock(breakNeckClock(clock), 2200); close(clock.seconds, 0.6);
  clock = tickNeckClock(clock, 2300); close(clock.seconds, 0.7);
});

test('calibration order: 3 s prep, 5 s of about ten frames a second, computing, and a 3 s failure notice before retrying', () => {
  let flow = startNeckFlow(0);
  const steps = new Map();
  for (let t = 0; t <= 8020; t += 33) {
    flow = advanceNeckFlow(flow, t, frame(t), 5000);
    steps.set(t, flow.step);
    if (t === 0) assert.equal(neckSecondsLeft(flow, t, 5000), 3);
    if (t === 3003) assert.equal(neckSecondsLeft(flow, t, 5000), 5);
  }
  assert.equal(steps.get(2970), 'prep'); assert.equal(steps.get(3003), 'collect'); assert.equal(steps.get(7986), 'collect');
  assert.equal(flow.step, 'computing'); assert.ok(flow.frames.length >= 48 && flow.frames.length <= 52, String(flow.frames.length));
  assert.ok(flow.frames.every((x, i) => i === 0 || x.t - flow.frames[i - 1].t >= NECK_FLOW.sampleMs - 5));
  assert.equal(advanceNeckFlow(flow, 9000, frame(9000), 5000), flow);
  assert.equal(finishNeckFlow(9000, { ok: true }).step, 'ready');
  const failed = finishNeckFlow(9000, { ok: false, reason: 'unstable' });
  assert.deepEqual([failed.step, failed.failure, neckSecondsLeft(failed, 9000, 5000)], ['failed', 'unstable', 3]);
  assert.equal(advanceNeckFlow(failed, 11999, null, 5000).step, 'failed');
  assert.deepEqual(advanceNeckFlow(failed, 12000, null, 5000), startNeckFlow(12000));
});

test('a shoulder reference that did not settle within the same 5 s is reported as one of the three failures', () => {
  for (const [reason, failure] of [['moving', 'unstable'], [null, 'unstable'], ['head-turned', 'not_upright'], ['low-confidence', 'too_few_frames'],
    ['missing-landmarks', 'too_few_frames'], ['out-of-frame', 'too_few_frames'], ['interrupted', 'too_few_frames']]) assert.equal(referenceFailure(reason), failure);
});

test('One Euro filter matches the study tool (0.5, 0.01, 1.0; ms in, seconds inside)', () => {
  const filter = createOneEuro(0.5, 0.01, 1.0);
  assert.equal(filter.filter(0, 0), 0);
  close(filter.filter(100, 100), 73.253, 1e-3);
  let value = 0;
  for (let t = 200; t <= 3000; t += 100) value = filter.filter(100, t);
  assert.ok(value > 99.9 && value <= 100);
  filter.reset(); assert.equal(filter.filter(40, 5000), 40);
});

test('each pose frame takes the face of the same video frame, else the nearest within 70 ms', () => {
  const faces = createFaceBuffer();
  const sample = (t, videoTime) => ({ t, videoTime, faces: [], matrices: [] });
  for (const [t, videoTime] of [[0, 0], [33, 0.033], [66, 0.066]]) faces.push(sample(t, videoTime));
  assert.equal(faces.match(60, 0.033).videoTime, 0.033);
  assert.equal(faces.match(50, 9).t, 66);
  assert.equal(faces.match(200, 9), null);
  for (let i = 0; i < 20; i++) faces.push(sample(1000 + i, 1 + i));
  assert.equal(faces.match(1000, 1).videoTime, 9); // only the latest 12 samples are kept
  faces.clear(); assert.equal(faces.match(1019, 20), null);
  faces.push({ ...sample(100, 0.5), generation: 1 });
  assert.equal(faces.match(110, 0.5, undefined, 2), null);
  faces.push({ ...sample(111, 0.499), generation: 2 });
  assert.equal(faces.match(112, 0.5, undefined, 2).t, 111);
});

test('the model input keeps pose 0–12 and the face nearest the pose nose with its head matrix', () => {
  const pose = Array.from({ length: 33 }, (_, i) => ({ x: i / 100, y: 0.5, z: -0.1, visibility: 0.9 }));
  pose[0] = { x: 0.5, y: 0.3, z: -0.2, visibility: 0.99 };
  const mesh = x => Array.from({ length: 478 }, (_, i) => ({ x: i === 1 ? x : 0.4, y: 0.3, z: 0 }));
  const face = { t: 0, videoTime: 0, faces: [mesh(0.9), mesh(0.51)], matrices: [{ data: Array(16).fill(1) }, { data: Array(16).fill(2) }] };
  const input = neckFrame(5, pose, face, 640, 480);
  assert.equal(input.pose.length, 13); assert.deepEqual(input.pose[0], [0.5, 0.3, -0.2, 0.99]);
  assert.equal(input.face[1][0], 0.51); assert.deepEqual(input.fmat, Array(16).fill(2));
  assert.deepEqual([input.t, input.imageW, input.imageH], [5, 640, 480]);
  assert.deepEqual([neckFrame(5, pose, null, 640, 480).face, neckFrame(5, undefined, face, 640, 480).pose], [null, null]);
});

test('neck policy: score = 100 − load score, deviation from 70 points at the default sensitivity, CVA = base − table(load × 1.5)', () => {
  assert.equal(neckScore(15), 85);
  close(neckDeviation(70), HABIT_POLICY.enterDelta); close(neckDeviation(80), HABIT_POLICY.exitDelta);
  // Handoff section 5 check values (base 50°), given to one decimal.
  for (const [loadPct, cva] of [[0, 50], [30, 39.6], [60, 32.8], [100, 21.7], [150, 9.9]]) assert.equal(estimatedCva(BASE_CVA.default, loadPct).toFixed(1), cva.toFixed(1));
  close(estimatedCva(55, 30), 44.59);
  // L′ = (100 − neck score) × 1.5, never below 0.
  assert.deepEqual([100, 80, 0, 101].map(neckLoadPct), [0, 30, 150, 0]);
  assert.deepEqual([BASE_CVA.min, BASE_CVA.default, BASE_CVA.max], [40, 50, 60]);
  assert.match(turtleScorePolicy.version, /^upper-body-neck-e19-v1-[0-9a-z]+$/);
  assert.ok(turtleScorePolicy.version.length <= 120);
  assert.equal(turtleScorePolicy.mode, 'turtle');
});

const fixtures = new URL('./fixtures/fhp-e19-parity/', import.meta.url);
test('the real E19 runs through the app runtime (calibrate on one held frame, then infer)',
  { skip: !existsSync(new URL('inputs.json', fixtures)) && 'parity fixtures not on this PC (git-ignored)' }, async () => {
    const ort = await import('onnxruntime-web');
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(readFileSync(new URL('../public/models/fhp-e19/model.onnx', import.meta.url)), { executionProviders: ['wasm'] });
    const model = createNeckModel(ort, session, config);
    const inputs = JSON.parse(readFileSync(new URL('inputs.json', fixtures), 'utf8'));
    const real = i => ({ t: i * 100, pose: inputs.pose[i], face: inputs.face_ok[i] ? inputs.face[i] : null, fmat: inputs.face_ok[i] ? inputs.fmat[i] : null, imageW: inputs.wh[i][0], imageH: inputs.wh[i][1] });
    const held = Array.from({ length: 50 }, (_, i) => ({ ...real(0), t: i * 100 }));
    const info = await model.calibrate(held);
    assert.ok(info.ok || info.reason === 'not_upright', JSON.stringify(info));
    if (!info.ok) return;
    const same = await model.infer(held[0]);
    assert.equal(same.measuring, true); close(same.deltaDeg, 0, 1e-3); close(same.loadPct, 0, 1e-2);
    for (const i of [10, 100, 200]) {
      const result = await model.infer(real(i));
      if (result.measuring) assert.ok([result.deltaDeg, result.loadPct, result.scoreNeck, result.scoreLoad].every(Number.isFinite));
    }
  });
