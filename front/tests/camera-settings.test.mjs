import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultQuad, normalizeProfile, readProfile, resolveProfile, validQuad, writeProfile } from '../src/features/camera/profile.ts';
import { automaticQuad, gridPolygons, projector } from '../src/features/camera/grid.ts';
import { canOpenCameraSettings } from '../electron/cameraWindow.ts';
import { adaptRuntimePress } from '../src/features/keyboard/runtime.ts';

const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };
test('camera profiles are isolated by mode and actual device; legacy keyboard settings migrate once', () => {
  const store = storage();
  store.setItem('moti.keyboard.camera', JSON.stringify({ angle: 90, brightness: 120 }));
  assert.equal(resolveProfile(store, 'eye', 'a').angle, 0);
  assert.equal(resolveProfile(store, 'keyboard', 'a').angle, 90);
  assert.equal(resolveProfile(store, 'keyboard', 'b').angle, 0);
  const profile = normalizeProfile({ brightness: 130, grid: { source: 'manual', quad: defaultQuad() } }, 'keyboard');
  writeProfile(store, 'keyboard', 'b', profile);
  assert.equal(readProfile(store, 'keyboard', 'b').brightness, 130);
  assert.equal(readProfile(store, 'keyboard', 'a').brightness, 120);
  assert.equal(readProfile(store, 'eye', 'b').brightness, 100);
  assert.equal(readProfile(store, 'upper_body', 'b').grid.source, 'automatic');
  assert.equal(readProfile(store, 'keyboard', 'b').grid.source, 'manual');
  store.setItem('moti.camera.v1:keyboard:bad', 'null');
  assert.equal(readProfile(store, 'keyboard', 'bad').brightness, 100);
});
test('manual boundaries reject crossed, concave, tiny, outside and nonfinite geometry', () => {
  assert.ok(validQuad(defaultQuad()));
  for (const quad of [[[0, 0], [1, 1], [1, 0], [0, 1]], [[0, 0], [1, 0], [.2, .1], [0, 1]], [[0, 0], [.01, 0], [.01, .01], [0, .01]], [[-1, 0], [1, 0], [1, 1], [0, 1]], [[0, 0], [NaN, 0], [1, 1], [0, 1]]]) assert.equal(validQuad(quad), false);
});
test('all 61 key polygons use perspective outer corners; automatic centers recover the same boundary', () => {
  const grid = { ...normalizeProfile({}, 'keyboard').grid, quad: [[.1, .15], [.8, .25], [.9, .85], [.05, .7]] };
  const polygons = gridPolygons(grid);
  assert.equal(Object.keys(polygons).length, 61);
  const project = projector(grid.quad);
  for (const [input, output] of [[[0, 0], grid.quad[0]], [[1, 0], grid.quad[1]], [[1, 1], grid.quad[2]], [[0, 1], grid.quad[3]]]) assert.ok(Math.hypot(...project(input).map((v, i) => v - output[i])) < 1e-9);
  const pixels = Object.fromEntries(Object.entries(polygons).map(([name, p]) => [name, p.map(([x, y]) => [x * 960, y * 540])]));
  const recovered = automaticQuad(pixels, 960, 540);
  // A mean of projected vertices is not exactly the projected center under perspective.
  recovered.forEach((p, i) => assert.ok(Math.hypot(p[0] - grid.quad[i][0], p[1] - grid.quad[i][1]) < .003));
});
test('grid flips and rotations move key labels without altering the image profile or boundary', () => {
  const profile = normalizeProfile({}, 'keyboard'), original = JSON.stringify(profile);
  const normal = gridPolygons(profile.grid)['~'][0];
  for (const change of [{ flipX: true }, { flipY: true }, { turns: 1 }, { turns: 2 }]) {
    assert.notDeepEqual(gridPolygons({ ...profile.grid, ...change })['~'][0], normal);
    assert.deepEqual(profile.grid.quad, defaultQuad());
  }
  assert.equal(JSON.stringify(profile), original);
});
test('camera window allowlist rejects other pages, frame names and appended parameters', () => {
  for (const base of ['http://localhost:5173/', 'file:///D:/Moti/dist/index.html']) {
    const url = new URL('camera-settings.html', base).href;
    assert.equal(canOpenCameraSettings(url, 'moti-camera-settings', base), true);
    for (const target of [url + '?extra=1', url + '#other', 'about:blank', 'https://example.com', base]) assert.equal(canOpenCameraSettings(target, 'moti-camera-settings', base), false);
    assert.equal(canOpenCameraSettings(url, '_blank', base), false);
  }
});
test('manual mapping uses validated geometry and genuine finger confidence; all timing and candidate gates remain', () => {
  const payload = { key_event: { code: 'KeyQ', key: 'q', sequence: 1 }, pressed_key: 'q', frame_delta_ms: 10,
    keyboard: { source: 'manual', geometry_validated: true, keys: { q: [[0, 0], [100, 0], [100, 100], [0, 100]] } },
    finger_keys: [{ hand: 'Left', finger: 'pinky', x: 50, y: 50, score: .91, matches_pressed_key: true, distance_to_pressed_key_center: 0 }] };
  assert.equal(adaptRuntimePress(payload).evaluation.verdict, 'preferred');
  assert.equal(adaptRuntimePress(payload).evaluation.confidence, .91);
  assert.equal(adaptRuntimePress({ ...payload, keyboard: { ...payload.keyboard, geometry_validated: false } }).evaluation.reason, 'low-keyboard-confidence');
  assert.equal(adaptRuntimePress({ ...payload, keyboard: { ...payload.keyboard, source: 'automatic' } }).evaluation.reason, 'low-keyboard-confidence');
  assert.equal(adaptRuntimePress({ ...payload, frame_delta_ms: 181 }).evaluation.reason, 'invalid-frame-timing');
  assert.equal(adaptRuntimePress({ ...payload, finger_keys: [{ ...payload.finger_keys[0], score: .79 }] }).evaluation.reason, 'no-reliable-candidate');
});
