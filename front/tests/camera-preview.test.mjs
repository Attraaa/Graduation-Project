import assert from 'node:assert/strict';
import test from 'node:test';
import { framePoint, normalizeFraming, unframePoint, zoomFraming } from '../src/features/camera/framing.ts';
import { analysisGrid, displayedGrid, gridPolygons } from '../src/features/camera/grid.ts';
import { imageSignature, normalizeProfile, readProfile, writeProfile } from '../src/features/camera/profile.ts';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} vs ${b}`);

test('wheel zoom preserves the camera point under the pointer; inverse maps edits back to the saved image', () => {
  const before = { zoom: 2, panX: .1, panY: -.05 }, pointer = [.6, .55];
  const source = unframePoint(pointer, before), after = zoomFraming(before, pointer, -120);
  assert.ok(after.zoom > before.zoom);
  framePoint(source, after).forEach((v, i) => near(v, pointer[i]));
  const restored = zoomFraming(after, pointer, 120);
  Object.keys(before).forEach(key => near(restored[key], before[key]));
  const edited = unframePoint([pointer[0] + .02, pointer[1] + .03], after);
  near(edited[0] - source[0], .02 / after.zoom);
  near(edited[1] - source[1], .03 / after.zoom);
  const boundaryFrame = normalizeFraming({ zoom: 1.032, panX: 1, panY: -.014550003380861355 });
  for (const point of [[0, 0], [1, 1]]) assert.deepEqual(unframePoint(framePoint(point, boundaryFrame), boundaryFrame), point);
});

test('saved zoom/pan remains finite, covers every output edge, and resets at 100%', () => {
  assert.deepEqual(normalizeFraming({ zoom: NaN, panX: Infinity, panY: 2 }), { zoom: 1, panX: 0, panY: 0 });
  assert.deepEqual(normalizeFraming({ zoom: 100, panX: 10, panY: -10 }), { zoom: 5, panX: 2, panY: -2 });
  for (const zoom of [1, 1.5, 3, 5]) {
    const frame = normalizeFraming({ zoom, panX: 100, panY: -100 });
    const a = framePoint([0, 0], frame), b = framePoint([1, 1], frame);
    assert.ok(a.every(v => v <= 0) && b.every(v => v >= 1));
    const fit = zoomFraming(frame, [.6, .4], 500);
    if (fit.zoom === 1) assert.deepEqual(fit, { zoom: 1, panX: 0, panY: 0 });
  }
  assert.deepEqual(zoomFraming(normalizeFraming(), [.5, .5], 100), normalizeFraming());
});

test('real camera framing persists independently per mode/device and changes analysis signatures', () => {
  const values = new Map(), storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const base = normalizeProfile({ angle: 90, brightness: 120 }, 'keyboard');
  const framed = normalizeProfile({ ...base, zoom: 3, panX: -.2, panY: .1 }, 'keyboard');
  writeProfile(storage, 'keyboard', 'a', framed);
  assert.deepEqual(readProfile(storage, 'keyboard', 'a'), framed);
  assert.equal(readProfile(storage, 'keyboard', 'b').zoom, 1);
  assert.equal(readProfile(storage, 'eye', 'a').zoom, 1);
  assert.notEqual(imageSignature(base), imageSignature(framed));
  storage.setItem('moti.camera.v1:keyboard:legacy', JSON.stringify({ angle: 90, brightness: 120 }));
  assert.deepEqual(readProfile(storage, 'keyboard', 'legacy'), base);
});

test('manual keys project with the real image, including a cropped boundary; saved geometry survives zoom-out', () => {
  const quad = [[.45, .4], [.55, .4], [.55, .5], [.45, .5]];
  const profile = normalizeProfile({ zoom: 3, panX: .1, panY: -.1, grid: { source: 'manual', quad } }, 'keyboard');
  assert.deepEqual(profile.grid.quad, quad);
  const baseKeys = gridPolygons(profile.grid), visible = gridPolygons(displayedGrid(profile));
  for (const name of Object.keys(baseKeys)) visible[name].forEach((p, i) => framePoint(baseKeys[name][i], profile).forEach((v, axis) => near(v, p[axis])));
  assert.deepEqual(analysisGrid(profile), { ...profile.grid, framing: { zoom: 3, panX: .1, panY: -.1 } });
  assert.deepEqual(normalizeProfile({ ...profile, zoom: 1, panX: 0, panY: 0 }, 'keyboard').grid.quad, quad);
  const cropped = normalizeProfile({ zoom: 3, panX: .1 }, 'keyboard');
  assert.ok(displayedGrid(cropped).quad[0][0] < 0);
  assert.ok(displayedGrid(cropped).quad[1][0] > 1);
});
