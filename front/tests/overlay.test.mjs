import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { OverlayWindow, fitOverlay } from '../electron/overlayWindow.ts';
import { commandAllowed, overlayTime, parseOverlayCommand, parseOverlaySnapshot } from '../src/features/overlay/contract.ts';
import { createIssueQueue } from '../src/features/notifications/issues.ts';

const session = { run: 1, running: true, paused: false, seconds: 65.5, status: '관찰 중', detail: '목 80점', error: false,
  metrics: [{ label: '목', value: '80', low: false }], note: '' };
// snapshot.ts imports without extensions, so it is bundled the way the app build sees it.
const bundle = await build({ entryPoints: ['src/features/overlay/snapshot.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { overlaySnapshot } = compiled.exports;
const snapshot = (sequence = 1, owner = 'owner-1') => ({ owner, sequence, theme: 'light', savingFailed: false, upper_body: { ...session }, keyboard: { ...session, running: false } });
class Window extends EventEmitter {
  destroyed = false; minimized = false; maximized = false; focused = false; shown = 0;
  bounds = { x: 20, y: 30, width: 1100, height: 800 };
  webContents = Object.assign(new EventEmitter(), { mainFrame: {}, messages: [], send(name, ...args) { this.messages.push([name, ...args]); }, setWindowOpenHandler(handler) { this.openHandler = handler; } });
  constructor(url = 'file:///app/index.html') { super(); this.webContents.mainFrame.url = url; }
  isDestroyed() { return this.destroyed; } isMinimized() { return this.minimized; } isMaximized() { return this.maximized; } isFocused() { return this.focused; }
  getBounds() { return { ...this.bounds }; } getNormalBounds() { return this.getBounds(); } setBounds(value) { this.bounds = value; }
  maximize() { this.maximized = true; } unmaximize() { this.maximized = false; } minimize() { this.minimized = true; } restore() { this.minimized = false; }
  show() { this.shown++; } showInactive() { this.shown++; } focus() { this.focused = true; }
  loadURL(url) { this.webContents.mainFrame.url = url; return Promise.resolve(); }
  destroy() { this.destroyed = true; this.emit('closed'); }
}
function harness() {
  const handlers = new Map(), owner = new Window(), children = [], positions = [];
  const event = w => ({ sender: w.webContents, senderFrame: w.webContents.mainFrame });
  const call = (name, ...args) => handlers.get(name)(event(owner), ...args);
  const screen = Object.assign(new EventEmitter(), { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }) });
  const controller = new OverlayWindow({ handle: (name, fn) => handlers.set(name, fn), on: (name, fn) => handlers.set(name, fn) }, {
    owner: () => owner, trustedOwner: e => { if (e.sender !== owner.webContents || e.senderFrame !== owner.webContents.mainFrame) throw Error('untrusted'); },
    create: options => { const w = new Window('file:///app/overlay.html'); w.bounds = options; children.push(w); return w; }, screen,
    url: 'file:///app/overlay.html', preload: '/preload.cjs', beforeOpen() {}, changed() {}, readPosition: () => null, writePosition: value => positions.push(value),
  });
  const childCall = (name, ...args) => handlers.get(name)(event(children.at(-1)), ...args);
  return { controller, owner, children, positions, call, childCall, handlers, screen, event };
}

test('overlay wire contracts strip extra fields and reject invalid/stale-shaped input', () => {
  const s = parseOverlaySnapshot({ ...snapshot(), token: 'never-forward' });
  assert.equal(Object.hasOwn(s, 'token'), false);
  const metric = parseOverlaySnapshot({ ...snapshot(), upper_body: { ...session, metrics: [{ label: '목', value: '80', low: true, color: 'red' }] } }).upper_body.metrics[0];
  assert.deepEqual(metric, { label: '목', value: '80', low: true });
  const three = [1, 2, 3].map(n => ({ label: `m${n}`, value: '1', low: false }));
  for (const input of [null, {}, { ...snapshot(), sequence: -1 }, { ...snapshot(), theme: 'other' }, { ...snapshot(), upper_body: { ...session, seconds: NaN } }, { ...snapshot(), upper_body: { ...session, running: false, paused: true } },
    { ...snapshot(), upper_body: { ...session, metrics: three } }, { ...snapshot(), upper_body: { ...session, metrics: [{ label: '목', value: 80, low: false }] } },
    { ...snapshot(), upper_body: { ...session, metrics: [{ label: '목', value: '80', low: 'yes' }] } }, { ...snapshot(), keyboard: { ...session, note: undefined } }]) assert.throws(() => parseOverlaySnapshot(input));
  assert.throws(() => parseOverlayCommand({ id: 'a', owner: 'o', mode: 'eye', run: 1, action: 'start' }));
  assert.throws(() => parseOverlayCommand({ id: 'a', owner: 'o', mode: 'keyboard', run: 1, action: 'toggle' }));
  assert.equal(overlayTime(3661.8), '01:01:01');
  assert.equal(overlayTime(0), '00:00:00');
  assert.equal(commandAllowed({ running: true, paused: true }, 'start'), false);
  assert.equal(commandAllowed({ running: true, paused: true }, 'stop'), true);
});

const counts = (preferred, mismatch) => [
  { date: '2026-11-21', code: 'KeyA', context: 'plain', finger: 'left:pinky', verdict: 'preferred', reason: 'preferred-finger', count: preferred },
  { date: '2026-11-21', code: 'KeyA', context: 'plain', finger: 'left:ring', verdict: 'mismatch', reason: 'other-finger', count: mismatch },
];
const controls = (over = {}) => ({ run: 3, isRunning: true, isPaused: false, elapsedSeconds: 42, failed: false, ...over });
// The last judged press scores the home card averages (100 for each preferred, 0 for each mismatch here).
const scores = (preferred, mismatch) => [...Array(preferred).fill(100), ...Array(mismatch).fill(0)];
const monitoring = ({ upper = {}, upperControls = {}, eye = {}, keyboard = {}, keyboardControls = {} } = {}) => ({
  upper: { controls: controls(upperControls), snapshot: { phase: 'observing', neck: { currentScore: 70.4 }, balance: { currentScore: 88 }, ...upper },
    eye: { phase: 'observing', measurement: { recentBlinksPerMinute: 14.2, calibrationPhase: null, calibrationBlinks: 0 }, ...eye } },
  keyboard: { controls: controls(keyboardControls), snapshot: { phase: 'ready', observationStatus: 'observing', counts: counts(8, 2), scores: scores(8, 2), latest: null, ...keyboard } },
});
const alertScores = (posture = 70, keyboard = 70) => ({ posture, keyboard });

test('overlay numbers turn red at or below the alert score as shown, and guidance replaces them', () => {
  const s = overlaySnapshot(monitoring(), 'owner-1', 1, 'light', false, alertScores());
  assert.deepEqual(parseOverlaySnapshot(s), s);
  assert.deepEqual(s.upper_body.metrics, [{ label: '목', value: '70', low: true }, { label: '균형', value: '88', low: false }]);
  assert.equal(s.upper_body.note, '깜빡임 14.2');
  assert.match(s.upper_body.detail, /목 70점 · 좌우 균형 88점 · 깜빡임 14.2회\/분/);
  // The same last-50 average as the home card: (8 x 100 + 2 x 0) / 10.
  assert.deepEqual(s.keyboard.metrics, [{ label: '키보드', value: '80', low: false }]);
  assert.match(s.keyboard.detail, /최근 평균 80점 · 판정한 입력 10회/);
  assert.equal(s.keyboard.note, '판정 10회');
  assert.equal(overlaySnapshot(monitoring(), 'o', 1, 'light', false, alertScores(90)).upper_body.metrics[1].low, true);
  assert.equal(overlaySnapshot(monitoring({ keyboard: { counts: counts(7, 3), scores: scores(7, 3) } }), 'o', 1, 'light', false, alertScores()).keyboard.metrics[0].low, true);
  // Each mode has its own alert score.
  assert.deepEqual(overlaySnapshot(monitoring(), 'o', 1, 'light', false, alertScores(70, 85)).keyboard.metrics[0].low, true);
  assert.deepEqual(overlaySnapshot(monitoring(), 'o', 1, 'light', false, alertScores(95, 70)).keyboard.metrics[0].low, false);

  const calibrating = neckModel => monitoring({ upper: { phase: 'calibrating', neckModel: { step: 'prep', secondsLeft: null, failure: null, ...neckModel } }, keyboard: { observationStatus: 'excluded' } });
  const guided = overlaySnapshot(calibrating({ secondsLeft: 3 }), 'o', 1, 'light', false, alertScores());
  assert.deepEqual([guided.upper_body.metrics, guided.upper_body.detail], [[], '편하게 바르게 앉아 화면 가운데를 보세요 · 3초 뒤 기록']);
  assert.equal(overlaySnapshot(calibrating({ step: 'collect', secondsLeft: 4 }), 'o', 1, 'light', false, alertScores()).upper_body.detail, '그대로 유지해 주세요 · 4초 남음');
  for (const [failure, text] of [['too_few_frames', '얼굴과 양쪽 어깨가 보이게 앉아 주세요'], ['unstable', '움직임이 있었어요. 그대로 앉아 계세요'], ['not_upright', '고개를 들어 화면 가운데를 봐 주세요']])
    assert.equal(overlaySnapshot(calibrating({ step: 'failed', failure, secondsLeft: 2 }), 'o', 1, 'light', false, alertScores()).upper_body.detail, `${text} · 2초 뒤 다시 시작`);
  assert.deepEqual([guided.keyboard.metrics, guided.keyboard.note], [[], '']);
  assert.match(guided.keyboard.detail, /미승인 앱/);

  const idle = overlaySnapshot(monitoring({ upperControls: { isRunning: false, elapsedSeconds: 0 }, keyboardControls: { isRunning: false, elapsedSeconds: 0 } }), 'o', 1, 'light', false, alertScores());
  assert.deepEqual(idle.upper_body.metrics.map(m => [m.value, m.low]), [['—', false], ['—', false]]);
  assert.deepEqual([idle.upper_body.status, idle.upper_body.note, idle.keyboard.metrics[0].value, idle.keyboard.note], ['준비됨', '', '—', '']);
});

test('open waits for rendered initial state, opens once, and back restores without a measurement command', async () => {
  const h = harness(); h.call('desktop:publish', snapshot());
  const opening = h.controller.open(); assert.equal(h.controller.open(), opening); assert.equal(h.children.length, 1);
  assert.equal(h.owner.minimized, false); h.childCall('overlay:ready'); await opening;
  assert.equal(h.owner.minimized, true); assert.equal(h.controller.isActive(), true);
  assert.equal(h.children[0].bounds.webPreferences.nodeIntegration, false);
  assert.deepEqual(h.children[0].webContents.openHandler(), { action: 'deny' });
  h.childCall('overlay:back'); assert.equal(h.controller.isActive(), false); assert.equal(h.owner.minimized, false);
  assert.equal(h.owner.focused, true); assert.equal(h.children[0].destroyed, true);
  assert.equal(h.owner.webContents.messages.filter(m => m[0] === 'desktop:command').length, 0);
  assert.equal(h.controller.view().snapshot.upper_body.run, 1); h.controller.shutdown();
});

test('wrong sender, frame, URL, and backwards state cannot replace the owner snapshot', async () => {
  const h = harness(); h.call('desktop:publish', snapshot(5));
  h.handlers.get('desktop:publish')({ sender: {}, senderFrame: {} }, snapshot(99, 'attacker'));
  h.call('desktop:publish', snapshot(4)); assert.equal(h.controller.view().snapshot.sequence, 5);
  const open = h.controller.open(); h.childCall('overlay:ready'); await open;
  assert.throws(() => h.handlers.get('overlay:command')(h.event(h.owner), {}), /허용되지/);
  const w = h.children[0]; assert.throws(() => h.handlers.get('overlay:state')({ sender: w.webContents, senderFrame: {} }), /허용되지/);
  w.webContents.mainFrame.url = 'file:///app/other.html'; assert.throws(() => h.childCall('overlay:state'), /허용되지/);
  h.controller.shutdown();
});

test('commands are acknowledged by the owner, replayed IDs cannot run twice, and a new owner cancels old work', async () => {
  const h = harness(); h.call('desktop:publish', snapshot()); const open = h.controller.open(); h.childCall('overlay:ready'); await open;
  const command = { id: 'cmd', owner: 'owner-1', mode: 'upper_body', run: 1, action: 'pause' };
  const result = h.childCall('overlay:command', command);
  assert.equal(h.owner.webContents.messages.at(-1)[0], 'desktop:command');
  h.call('desktop:complete', 'cmd', { ok: true }); assert.deepEqual(await result, { ok: true });
  const count = h.owner.webContents.messages.length; assert.equal((await h.childCall('overlay:command', command)).ok, true); assert.equal(h.owner.webContents.messages.length, count);
  assert.equal((await h.childCall('overlay:command', { ...command, id: 'wrong-run', run: 0 })).ok, false);
  const pending = h.childCall('overlay:command', { ...command, id: 'late' });
  h.call('desktop:publish', snapshot(1, 'owner-2')); assert.equal((await pending).ok, false); assert.equal(h.controller.isActive(), false);
  h.call('desktop:complete', 'late', { ok: true }); h.controller.shutdown();
});

test('stale snapshots are marked disconnected; stop remains relayable and timed-out commands do not pretend success', async context => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'] });
  const h = harness(); h.call('desktop:publish', snapshot()); const open = h.controller.open(); h.childCall('overlay:ready'); await open;
  context.mock.timers.tick(4001); assert.equal(h.controller.view().connected, false);
  const command = { id: 'stale', owner: 'owner-1', mode: 'upper_body', run: 1, action: 'pause' };
  assert.equal((await h.childCall('overlay:command', command)).ok, false);
  const stop = h.childCall('overlay:command', { ...command, id: 'stop', action: 'stop' }); context.mock.timers.tick(3000);
  assert.equal((await stop).ok, false); h.controller.shutdown();
});

test('failed overlay readiness leaves the owner available; display changes keep every control on-screen', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const h = harness(); h.call('desktop:publish', snapshot()); const open = h.controller.open();
  context.mock.timers.tick(8000); await assert.rejects(open, /준비/); assert.equal(h.owner.minimized, false); assert.equal(h.children[0].destroyed, true);
  assert.deepEqual(fitOverlay({ x: 5000, y: -100, width: 360, height: 320 }, { x: -1280, y: 100, width: 1280, height: 800 }), { x: -360, y: 100, width: 360, height: 320 });
  h.controller.shutdown();
});

test('a display change puts a shrunken bar back to its fixed size and keeps its place', async () => {
  const h = harness(); h.call('desktop:publish', snapshot()); const open = h.controller.open(); h.childCall('overlay:ready'); await open;
  const w = h.children[0];
  assert.deepEqual([w.bounds.minWidth, w.bounds.maxWidth, w.bounds.minHeight, w.bounds.maxHeight], [340, 340, 118, 118]);
  w.bounds = { x: 325, y: 474, width: 276, height: 86 };  // what Windows reported after a long session
  h.screen.emit('display-metrics-changed');
  assert.deepEqual(w.getBounds(), { x: 325, y: 474, width: 340, height: 118 });
  h.controller.shutdown();
});

test('issue delivery is per incident, suppressed delivery consumes no episode, and recovery cancels late acknowledgements', () => {
  const q = createIssueQueue(); q.set({ key: 'upper', id: '1', code: 'upper-analysis' }, 0);
  const first = q.next(0); q.acknowledge(first, { ok: false, status: 'suppressed' }, 0); assert.equal(q.next(500), null); assert.equal(q.next(1000), first);
  q.acknowledge(first, { ok: true }, 1000); assert.equal(q.next(1001), null);
  q.set({ key: 'storage', id: '1', code: 'storage' }, 1001); assert.equal(q.next(1001).code, 'storage');
  q.set({ key: 'upper', id: '2', code: 'upper-analysis' }, 1002); q.acknowledge(first, { ok: true }, 1003);
  q.set({ key: 'storage', id: '', code: null }, 1003); assert.equal(q.next(1003).id, '2');
  q.clear(); assert.equal(q.next(1004), null);
});

test('old or repeatedly failing issue delivery cannot flood Windows', () => {
  const q = createIssueQueue(); q.set({ key: 'upper', id: 'old', code: 'upper-analysis' }, 0); assert.equal(q.next(60000), null);
  q.set({ key: 'auth', id: '1', code: 'auth' }, 60000); const incident = q.next(60000);
  for (const at of [60000, 75000, 90000]) { assert.equal(q.next(at), incident); q.acknowledge(incident, { ok: false }, at); }
  assert.equal(q.next(105000), null);
});
