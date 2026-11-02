import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readHeadPose } from '../src/features/dual-monitor/headPose.ts';
import {
  advanceRegistration, clearLayout, displayKey, expireRegistration, finishRegistration, layoutIssue, parseLayout, readLayout,
  registrationTargets, sideOf, startRegistration, writeLayout,
} from '../src/features/dual-monitor/layout.ts';
import {
  AWAY, advanceScreenTracker, classifyScreen, createScreenTracker, interruptScreenTracker, screenAdvice, summarizeScreens,
} from '../src/features/dual-monitor/tracker.ts';
import { describeDisplays, findDisplay, targetBounds } from '../electron/displays.ts';

const radians = degrees => degrees * Math.PI / 180;
const multiply = (a, b) => a.map((row, r) => row.map((_, c) => a[r].reduce((sum, _, k) => sum + a[r][k] * b[k][c], 0)));
/** 4x4 transform with R = Ry(yaw) · Rx(pitch) · Rz(roll), uniform scale and a camera-space translation. */
function faceMatrix(yaw, pitch, roll = 0, { scale = 1, rowMajor = false } = {}) {
  const [a, b, c] = [yaw, pitch, roll].map(radians);
  const ry = [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
  const rx = [[1, 0, 0], [0, Math.cos(b), -Math.sin(b)], [0, Math.sin(b), Math.cos(b)]];
  const rz = [[Math.cos(c), -Math.sin(c), 0], [Math.sin(c), Math.cos(c), 0], [0, 0, 1]];
  const r = multiply(multiply(ry, rx), rz).map(row => row.map(value => value * scale));
  const full = [[...r[0], 3], [...r[1], -2], [...r[2], -45], [0, 0, 0, 1]];
  const data = rowMajor ? full.flat() : [0, 1, 2, 3].flatMap(column => full.map(row => row[column]));
  return { rows: 4, columns: 4, data };
}
const face = matrix => ({ faceLandmarks: [[]], facialTransformationMatrixes: [matrix] });

test('head pose reads yaw and pitch from the face transform, ignoring roll and scale', () => {
  for (const [yaw, pitch, roll] of [[0, 0, 0], [32, -6, 4], [-41, 12, -9], [15, 25, 20]]) {
    for (const options of [{}, { scale: 3.7 }, { rowMajor: true }]) {
      const pose = readHeadPose(face(faceMatrix(yaw, pitch, roll, options)));
      assert.ok(Math.abs(pose.yaw - yaw) < 1e-9 && Math.abs(pose.pitch - pitch) < 1e-9, JSON.stringify({ yaw, pitch, roll, options, pose }));
    }
  }
});

test('head pose is unavailable without exactly one face and a valid 4x4 transform', () => {
  const matrix = faceMatrix(10, 0);
  assert.equal(readHeadPose({ faceLandmarks: [], facialTransformationMatrixes: [] }), null);
  assert.equal(readHeadPose({ faceLandmarks: [[], []], facialTransformationMatrixes: [matrix, matrix] }), null);
  assert.equal(readHeadPose({ faceLandmarks: [[]] }), null);
  assert.equal(readHeadPose(face({ rows: 3, columns: 3, data: matrix.data.slice(0, 9) })), null);
  assert.equal(readHeadPose(face({ ...matrix, data: matrix.data.map((value, index) => index === 5 ? Number.NaN : value) })), null);
  assert.equal(readHeadPose(face({ ...matrix, data: matrix.data.map((value, index) => index < 3 ? 0 : value) })), null);
});

const front = { yaw: 0, pitch: 0 }, right = { yaw: 35, pitch: 0 };
const feedRegistration = (state, from, to, pose, step = 50) => {
  for (let at = from; at <= to; at += step) state = advanceRegistration(state, at, typeof pose === 'function' ? pose(at) : pose);
  return state;
};

test('registration waits for the head to turn, then stores a steady direction per monitor', () => {
  let state = startRegistration(registrationTargets(null), 0);
  state = feedRegistration(state, 0, 1150, front);
  assert.equal(state.samples.length, 0, 'lead-in samples are ignored');
  state = feedRegistration(state, 1200, 2650, front);
  assert.equal(state.step, 0);
  assert.ok(state.progress > 0.9 && state.progress < 1);
  state = feedRegistration(state, 2700, 2700, front);
  assert.equal(state.step, 1, 'front registered after 1.5 s of steady samples');
  state = feedRegistration(state, 2750, 6000, { yaw: 6, pitch: 3 });
  assert.equal(state.issue, 'too-close', 'still looking at (near) the first monitor');
  assert.equal(state.progress, 0);
  state = feedRegistration(state, 6050, 7500, right);
  assert.equal(state.status, 'collecting');
  state = feedRegistration(state, 7550, 7550, right);
  assert.equal(state.status, 'done');
  assert.deepEqual(state.captured.map(item => [item.id, item.yaw]), [['front', 0], ['side', 35]]);
  const layout = finishRegistration(state, 'camera-a', null);
  assert.deepEqual(layout.screens.map(screen => [screen.label, screen.main]), [['정면 모니터', true], ['보조 모니터', false]]);
  assert.equal(layout.displayKey, null);
  assert.equal(layout.cameraKey, 'camera-a');
});

test('registration restarts on head motion and on long face loss, but tolerates short dropouts', () => {
  let unstable = startRegistration(registrationTargets(null), 0);
  unstable = feedRegistration(unstable, 1200, 5000, at => ({ yaw: at % 100 ? 0 : 8, pitch: 0 }));
  assert.equal(unstable.step, 0);
  assert.equal(unstable.issue, 'unstable');

  let dropout = startRegistration(registrationTargets(null), 0);
  dropout = advanceRegistration(dropout, 1250, null);
  assert.equal(dropout.issue, 'no-face');
  dropout = feedRegistration(dropout, 1300, 2000, front);
  assert.equal(dropout.issue, null);
  dropout = feedRegistration(dropout, 2050, 2400, null);
  assert.ok(dropout.samples.length > 0, 'a 400 ms dropout keeps the collected samples');
  dropout = feedRegistration(dropout, 2450, 2800, front);
  assert.equal(dropout.step, 1);

  let lost = startRegistration(registrationTargets(null), 0);
  lost = feedRegistration(lost, 1200, 2000, front);
  lost = feedRegistration(lost, 2050, 2600, null);
  assert.equal(lost.issue, 'no-face');
  assert.equal(lost.samples.length, 0);
});

test('registration fails after the step timeout, even when no samples arrive', () => {
  const targets = registrationTargets(null);
  assert.equal(expireRegistration(startRegistration(targets, 0), 15000).status, 'collecting');
  const silent = expireRegistration(startRegistration(targets, 0), 15001);
  assert.deepEqual([silent.status, silent.issue], ['failed', 'timeout']);
  const faceless = feedRegistration(startRegistration(targets, 0), 1200, 15100, null);
  assert.deepEqual([faceless.status, faceless.issue], ['failed', 'no-face']);
  assert.equal(advanceRegistration(faceless, 15200, front), faceless);
});

const display = (id, x, extra = {}) => ({ id, label: `D${id}`, bounds: { x, y: 0, width: 1920, height: 1080 }, primary: false, app: false, ...extra });
const register = (targets, poses) => {
  let state = startRegistration(targets, 0), at = 0;
  for (const pose of poses) { state = feedRegistration(state, at, at + 3000, pose); at = state.stepStartedAt; }
  return state;
};

test('desktop registration starts on the Moti monitor and names others by the OS arrangement', () => {
  const displays = [display('7', 0), display('3', 1920, { app: true })];
  const targets = registrationTargets(displays);
  assert.deepEqual(targets, [{ id: 'display:3', displayId: '3' }, { id: 'display:7', displayId: '7' }]);
  const layout = finishRegistration(register(targets, [{ yaw: 31, pitch: 2 }, { yaw: -2, pitch: 1 }]), 'cam', displays);
  assert.deepEqual(layout.screens.map(screen => [screen.id, screen.label, screen.main]), [['display:3', '오른쪽 모니터', false], ['display:7', '정면 모니터', true]]);
  assert.equal(layout.displayKey, displayKey(displays));

  const three = [display('1', -1920), display('2', 0, { app: true }), display('3', 1920)];
  const named = finishRegistration(register(registrationTargets(three), [{ yaw: 1, pitch: 0 }, { yaw: -38, pitch: 0 }, { yaw: 36, pitch: 0 }]), 'cam', three);
  assert.deepEqual(named.screens.map(screen => screen.label), ['정면 모니터', '왼쪽 모니터', '오른쪽 모니터']);
  const sameSide = [display('1', 0, { app: true }), display('2', 1920), display('3', 3840)];
  const numbered = finishRegistration(register(registrationTargets(sameSide), [{ yaw: 0, pitch: 0 }, { yaw: 30, pitch: 0 }, { yaw: 55, pitch: 0 }]), 'cam', sameSide);
  assert.deepEqual(numbered.screens.map(screen => screen.label), ['정면 모니터', '오른쪽 모니터 1', '오른쪽 모니터 2']);
  assert.equal(sideOf({ x: 0, y: 0, width: 1920, height: 1080 }, { x: 200, y: 1080, width: 1366, height: 768 }), 'below');
  assert.equal(registrationTargets([display('1', 0)]).every(target => target.displayId === null), true, 'one monitor falls back to manual');
  assert.equal(registrationTargets([0, 1, 2, 3, 4].map(index => display(String(index), index * 1920))).length, 4);
});

test('a stored layout is reused only for the same camera image and monitor arrangement', () => {
  const displays = [display('1', 0), display('2', 1920)];
  const layout = { version: 1, cameraKey: 'cam', displayKey: displayKey(displays), screens: [
    { id: 'display:1', label: '정면 모니터', yaw: 0, pitch: 0, main: true }, { id: 'display:2', label: '오른쪽 모니터', yaw: 33, pitch: 0, main: false }] };
  assert.equal(displayKey([...displays].reverse()), layout.displayKey, 'order-insensitive');
  assert.equal(displayKey([displays[0]]), null);
  assert.equal(layoutIssue(layout, 'cam', displays), null);
  assert.equal(layoutIssue(layout, null, undefined), null, 'unknown values are not treated as changes');
  assert.equal(layoutIssue(layout, 'other', displays), 'camera');
  assert.equal(layoutIssue(layout, 'cam', [displays[0], display('2', 2560)]), 'displays');
  assert.equal(layoutIssue(layout, 'cam', null), 'displays');

  const values = new Map();
  const store = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  writeLayout(layout, store);
  assert.deepEqual(readLayout(store), layout);
  clearLayout(store);
  assert.equal(readLayout(store), null);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(readLayout(broken), null);
  assert.doesNotThrow(() => { writeLayout(layout, broken); clearLayout(broken); });
  for (const text of ['{', 'null', JSON.stringify({ ...layout, version: 2 }), JSON.stringify({ ...layout, screens: layout.screens.slice(0, 1) }),
    JSON.stringify({ ...layout, screens: layout.screens.map(screen => ({ ...screen, main: true })) }),
    JSON.stringify({ ...layout, screens: [layout.screens[0], { ...layout.screens[1], yaw: 'x' }] }),
    JSON.stringify({ ...layout, screens: [layout.screens[0], { ...layout.screens[1], id: 'display:1' }] })]) {
    assert.equal(parseLayout(text), null, text);
  }
});

const layout = { version: 1, cameraKey: 'cam', displayKey: null, screens: [
  { id: 'front', label: '정면 모니터', yaw: 0, pitch: 0, main: true }, { id: 'right', label: '오른쪽 모니터', yaw: 35, pitch: 0, main: false }] };
const feed = (state, from, to, pose, step = 100) => {
  for (let at = from; at <= to; at += step) state = advanceScreenTracker(state, layout, at, pose);
  return state;
};

test('screen time switches after the dwell and gives the dwell time to the new monitor', () => {
  let state = feed(createScreenTracker(), 0, 10000, front);
  assert.deepEqual([state.current, state.msByZone.front, state.observedMs], ['front', 10000, 10000]);
  state = feed(state, 10100, 10200, right);
  assert.equal(state.current, 'front', 'a 200 ms glance is not a switch yet');
  state = feed(state, 10300, 10300, right);
  assert.deepEqual([state.current, state.msByZone.front, state.msByZone.right, state.switches, state.currentSince], ['right', 10000, 300, 1, 10000]);
  state = feed(state, 10400, 70300, right);
  assert.equal(state.msByZone.right, 60300);
  assert.equal(state.longestSideStreakMs, 60300);
  assert.equal(state.observedMs, state.msByZone.front + state.msByZone.right);
});

test('short glances and boundary noise stay with the current monitor', () => {
  let state = feed(createScreenTracker(), 0, 10000, front);
  state = feed(state, 10100, 10200, right);
  state = feed(state, 10300, 10300, front);
  assert.deepEqual([state.current, state.msByZone.front, state.msByZone.right, state.switches], ['front', 10300, undefined, 0]);
  assert.equal(classifyScreen(layout, { yaw: 18.5, pitch: 0 }, 'front'), 'front', 'within the switch margin');
  assert.equal(classifyScreen(layout, { yaw: 18.5, pitch: 0 }, null), 'right');
  assert.equal(classifyScreen(layout, { yaw: 20, pitch: 0 }, 'front'), 'right');
  assert.equal(classifyScreen(layout, { yaw: -40, pitch: 0 }, 'front'), AWAY);
  state = feed(state, 10400, 12000, { yaw: 18.5, pitch: 0 });
  assert.equal(state.current, 'front');
});

test('looking away is timed separately and does not count as a monitor switch', () => {
  let state = feed(createScreenTracker(), 0, 1000, front);
  state = feed(state, 1100, 3000, { yaw: -40, pitch: 0 });
  assert.deepEqual([state.current, state.msByZone[AWAY], state.switches], [AWAY, 2000, 0]);
  state = feed(state, 3100, 5000, right);
  assert.deepEqual([state.current, state.switches, state.lastScreen], ['right', 1, 'right']);
});

test('gaps, missing faces and pauses never add time', () => {
  let state = feed(createScreenTracker(), 0, 1000, front);
  state = advanceScreenTracker(state, layout, 3000, front);
  assert.deepEqual([state.msByZone.front, state.currentSince], [1000, 3000], 'a 2 s gap is not counted');
  state = advanceScreenTracker(state, layout, 3500, null);
  assert.equal(state.current, 'front', 'a short face loss keeps the zone');
  state = advanceScreenTracker(state, layout, 4100, null);
  assert.equal(state.current, null, 'a long face loss ends continuity');
  state = advanceScreenTracker(state, layout, 4200, front);
  assert.equal(state.msByZone.front, 1000);
  assert.equal(advanceScreenTracker(state, layout, 4200, front), state, 'non-increasing time is ignored');

  let paused = feed(createScreenTracker(), 0, 1000, front);
  paused = feed(paused, 1100, 1200, right);
  paused = interruptScreenTracker(paused);
  assert.deepEqual([paused.current, paused.lastAt, paused.msByZone.front, paused.pending], [null, null, 1200, null]);
  paused = feed(paused, 60000, 60500, front);
  assert.equal(paused.msByZone.front, 1700, 'time across the pause is excluded');
});

test('summary shows only a fresh zone, shares and placement advice after enough observation', () => {
  let state = feed(createScreenTracker(), 0, 10000, front);
  state = feed(state, 10100, 40000, right);
  const now = state.lastAt;
  const summary = summarizeScreens(state, layout, now);
  assert.deepEqual(summary.current, { id: 'right', label: '오른쪽 모니터', main: false });
  assert.equal(summary.currentMs, 30000);
  assert.deepEqual(summary.shares.map(share => [share.id, share.ms]), [['front', 10000], ['right', 30000]]);
  assert.equal(summary.shares.reduce((sum, share) => sum + share.share, 0), 1);
  assert.equal(summary.advice, null, 'under five minutes');
  assert.equal(summarizeScreens(state, layout, now + 1500).current, null);
  assert.equal(summarizeScreens(createScreenTracker(), layout, 0).shares.every(share => share.share === 0), true);

  assert.equal(screenAdvice(4 * 60_000, 3 * 60_000, 0), null);
  assert.equal(screenAdvice(600_000, 300_000, 0).kind, 'side-heavy');
  assert.equal(screenAdvice(600_000, 200_000, 600_000).kind, 'long-side');
  assert.equal(screenAdvice(600_000, 100_000, 60_000).kind, 'front-centered');
});

test('desktop helpers expose plain display data and accept only connected display ids', () => {
  const described = describeDisplays([
    { id: 3, label: ' ', bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, internal: false },
    { id: 7, label: 'DELL U2720Q', bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
  ], 7, 3);
  assert.deepEqual(described, [
    { id: '7', label: 'DELL U2720Q', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, primary: true, app: false },
    { id: '3', label: '모니터 1', bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, primary: false, app: true },
  ]);
  const connected = [{ id: 7 }, { id: 3 }];
  assert.deepEqual(findDisplay(connected, '3'), { id: 3 });
  for (const id of [3, '9', '3; rm', '', null, undefined, {}]) assert.equal(findDisplay(connected, id), null, String(id));
  assert.deepEqual(targetBounds({ x: 1920, y: 0, width: 2560, height: 1400 }), { x: 3040, y: 590, width: 320, height: 220 });
});

const bundle = await build({ entryPoints: ['src/features/dual-monitor/DualMonitorPanel.tsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const view = overrides => ({ layout: null, issue: null, displayCount: null, registration: null, summary: null,
  register() {}, cancelRegistration() {}, forget() {}, onHeadPose() {}, ...overrides });
const render = (overrides, isRunning = true, isPaused = false) => {
  const html = renderToStaticMarkup(createElement(compiled.exports.default, { view: view(overrides), isRunning, isPaused }));
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
  return { html, text: html.replace(/<[^>]+>/g, '') };
};

test('panel invites registration and explains when it is possible', () => {
  const desktop = render({ displayCount: 2 });
  assert.match(desktop.text, /모니터 2대가 연결되어 있습니다/);
  assert.match(desktop.html, /<button type="button" class="[^"]*">모니터 방향 등록<\/button>/);
  const stopped = render({ displayCount: 1 }, false);
  assert.match(stopped.text, /연결된 모니터가 1대로 보입니다/);
  assert.match(stopped.html, /disabled="">모니터 방향 등록/);
  assert.match(stopped.text, /상체 측정 중에 등록할 수 있습니다/);
  const stale = render({ layout, issue: 'camera' });
  assert.match(stale.text, /카메라나 영상 설정이 바뀌어 등록한 방향을 쓸 수 없습니다/);
  assert.match(stale.text, /등록 해제/);
});

test('panel guides each registration step and a failed registration', () => {
  const manual = render({ registration: { step: 1, total: 2, progress: 0.4, issue: 'too-close', status: 'collecting', manual: true } });
  assert.match(manual.text, /2\/2 · 보조 모니터의 가운데를 바라봐 주세요/);
  assert.match(manual.text, /이번 화면 쪽으로 고개를 돌려 주세요/);
  assert.match(manual.html, /<progress[^>]*value="0.4"/);
  const desktop = render({ registration: { step: 0, total: 3, progress: 0, issue: null, status: 'collecting', manual: false } });
  assert.match(desktop.text, /1\/3 · 초록 점이 나타난 화면의 가운데를 바라봐 주세요/);
  const failed = render({ registration: { step: 0, total: 2, progress: 0, issue: 'no-face', status: 'failed', manual: true } });
  assert.match(failed.text, /모니터 방향을 등록하지 못했습니다/);
  assert.match(failed.text, /다시 시도/);
  assert.match(failed.text, /닫기/);
  assert.doesNotMatch(failed.html, /<progress/);
});

test('panel shows the watched monitor, time shares and advice', () => {
  let state = feed(createScreenTracker(), 0, 120_000, front);
  state = feed(state, 120_100, 420_000, right);
  const summary = summarizeScreens(state, layout, state.lastAt);
  const live = render({ layout, summary });
  assert.match(live.text, /지금 보는 화면오른쪽 모니터 · 5분째/);
  assert.match(live.text, /정면 모니터29% · 2분/);
  assert.match(live.text, /오른쪽 모니터71% · 5분/);
  assert.match(live.text, /화면 전환 1회 · 정면이 아닌 화면 최장 연속 5분/);
  assert.match(live.text, /정면이 아닌 화면을 본 시간이 71%입니다/);
  assert.match(live.html, /aria-label="화면별 시간 정면 모니터 29%, 오른쪽 모니터 71%"/);
  const stopped = render({ layout, summary }, false);
  assert.match(stopped.text, /지금 보는 화면측정 중이 아님/);
  const empty = render({ layout, summary: null });
  assert.match(empty.text, /화면별 시간이 여기에 쌓입니다. 등록한 화면: 정면 모니터, 오른쪽 모니터/);
});
