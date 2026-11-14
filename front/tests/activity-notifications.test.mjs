import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeyboardAlerts, createBlinkAlerts } from '../src/features/notifications/activityAlerts.ts';
import { initialKeyboardSnapshot } from '../src/features/keyboard/monitorTypes.ts';
import { emptyEyeSnapshot, createEyeMeasurement } from '../src/features/eye/measurement.ts';
import { notificationContent, notificationTarget } from '../src/features/notifications/contract.ts';
import { registerNotificationHandlers } from '../electron/notificationHandlers.ts';

const settings = { enabled: true, intervalMinutes: 0, silent: true, scoreThreshold: 95 };
const input = (id, verdict = 'nearby', extra = {}) => ({ ...initialKeyboardSnapshot, phase: 'ready', observationStatus: 'observing',
  latest: { id, evaluation: { verdict } }, ...extra });
const eye = (openReminder = true, extra = {}) => ({ phase: 'observing', message: '',
  measurement: { ...emptyEyeSnapshot(), calibrated: true, openReminder }, ...extra });
const fill = (alerts, start = 1, verdict = 'nearby', now = 0) => {
  for (let id = start; id < start + 20; id++) alerts.observe(input(id, verdict), now);
};

test('keyboard requires 20 valid judgments, includes exactly 70, and uses the rolling window rather than session average', () => {
  const alerts = createKeyboardAlerts();
  for (let id = 1; id <= 19; id++) alerts.observe(input(id), 0);
  assert.equal(alerts.sample(settings, 0), null);
  alerts.observe(input(20), 0);
  assert.deepEqual(alerts.sample(settings, 0), { kind: 'keyboard', silent: true, score: 70 });
  alerts.observe(input(21, 'preferred'), 1);
  assert.equal(alerts.sample(settings, 1), null); // 71.5: the posture threshold (95) does not apply.
  alerts.observe(input(22, 'mismatch'), 2);
  assert.equal(alerts.sample(settings, 2).score, 68);
});

test('unknown judgments, duplicate and out-of-order ids do not fill or distort the valid denominator', () => {
  const alerts = createKeyboardAlerts();
  for (let id = 1; id <= 19; id++) alerts.observe(input(id, 'mismatch'), 0);
  for (const id of [19, 5, 0]) alerts.observe(input(id, 'preferred'), 1);
  alerts.observe(input(20, 'unknown'), 1);
  assert.equal(alerts.sample(settings, 1), null);
  alerts.observe(input(21, 'mismatch'), 2);
  assert.equal(alerts.sample(settings, 2).score, 0);
});

test('every rapid input is counted even when display snapshots could be batched', () => {
  const alerts = createKeyboardAlerts();
  fill(alerts, 1, 'mismatch', 42);
  assert.equal(alerts.sample(settings, 42).score, 0);
});

test('excluded, off, preparing, mapping and failed snapshots clear the window; retained inputs are not recounted', () => {
  for (const extra of [{ observationStatus: 'excluded' }, { observationStatus: 'off' }, { phase: 'starting' }, { phase: 'mapping' }, { phase: 'error' }]) {
    const alerts = createKeyboardAlerts(); fill(alerts);
    alerts.observe(input(21, 'nearby', extra), 1);
    alerts.observe(input(21), 2);
    for (let id = 22; id <= 40; id++) alerts.observe(input(id), 2);
    assert.equal(alerts.sample(settings, 2), null);
    alerts.observe(input(41), 3); assert.ok(alerts.sample(settings, 3));
  }
});

test('pause/OFF need a fresh window and do not replay a retained press; new run clears id and cooldown', () => {
  const alerts = createKeyboardAlerts(); fill(alerts);
  const first = alerts.sample(settings, 0); alerts.acknowledge(first, 0);
  alerts.interrupt(); fill(alerts); assert.equal(alerts.sample(settings, 10_000), null);
  fill(alerts, 21, 'nearby', 10_000); assert.ok(alerts.sample(settings, 10_000));
  alerts.sample({ ...settings, enabled: false }, 10_001);
  assert.equal(alerts.sample(settings, 10_001), null);
  alerts.reset(); fill(alerts); assert.ok(alerts.sample(settings, 0));
});

test('idle keyboard results cannot alert later; a new valid input can refresh the last-20 window', () => {
  const alerts = createKeyboardAlerts(); fill(alerts);
  assert.equal(alerts.sample(settings, 2001), null);
  alerts.observe(input(21, 'unknown'), 2002); assert.equal(alerts.sample(settings, 2002), null);
  alerts.observe(input(22), 2003); assert.ok(alerts.sample(settings, 2003));
});

test('blink uses the calibrated existing reminder and excludes calibration, unavailable, failure and stale updates', () => {
  const alerts = createBlinkAlerts();
  for (const update of [eye(false), eye(true, { phase: 'calibrating' }), eye(true, { phase: 'unavailable' }), eye(true, { phase: 'error' }),
    eye(true, { measurement: { ...emptyEyeSnapshot(), openReminder: true } })]) {
    alerts.observe(update, 0); assert.equal(alerts.sample(settings, 0), null);
  }
  alerts.observe(eye(), 0); assert.deepEqual(alerts.sample(settings, 0), { kind: 'blink', silent: true });
  assert.equal(alerts.sample(settings, 2001), null);
  alerts.observe(eye(false), 2002); assert.equal(alerts.sample(settings, 2002), null);
});

test('actual eye measurement feeds an alert at 15s of valid open eyes, with no wall-clock or low-BPM shortcut', () => {
  const engine = createEyeMeasurement(), alerts = createBlinkAlerts();
  const open = { left: 0.05, right: 0.1, faceWidth: 0.3 }, closed = { ...open, left: 0.9, right: 0.9 };
  let now = 0;
  const step = (observation = open, dt = 50) => {
    now += dt; const measurement = engine.sample(now, observation);
    alerts.observe({ phase: measurement.calibrated ? 'observing' : 'calibrating', message: '', measurement }, now);
    return alerts.sample(settings, now);
  };
  for (let i = 0; i <= 60; i++) assert.equal(step(), null);
  for (let i = 0; i < 3; i++) { step(); step(closed); step(closed); assert.equal(step(), null); }
  // Prime the first post-calibration open frame; calibration time does not count.
  assert.equal(step(), null);
  for (let i = 0; i < 299; i++) assert.equal(step(), null);
  assert.equal(step().kind, 'blink');
  assert.equal(step(null), null);
  assert.equal(step(open, 20_000), null);
  for (let i = 0; i < 299; i++) assert.equal(step(), null);
  assert.equal(step().kind, 'blink');
});

test('blink pause, OFF and reference/run reset invalidate old proposals and require new eye updates', () => {
  const alerts = createBlinkAlerts(); alerts.observe(eye(), 0); const old = alerts.sample(settings, 0);
  alerts.interrupt(); assert.equal(alerts.acknowledge(old, 0), false); assert.equal(alerts.sample(settings, 0), null);
  alerts.observe(eye(), 1); alerts.sample({ ...settings, enabled: false }, 1); assert.equal(alerts.sample(settings, 1), null);
  alerts.observe(eye(), 2); const next = alerts.sample(settings, 2); alerts.acknowledge(next, 2);
  alerts.reset(); alerts.observe(eye(), 3); assert.ok(alerts.sample(settings, 3));
});

test('separate channels share the configured interval without consuming each other or suppressed/failed proposals', () => {
  const keyboard = createKeyboardAlerts(), blink = createBlinkAlerts();
  const repeat = { ...settings, intervalMinutes: 5 };
  fill(keyboard); blink.observe(eye(), 0);
  const failed = keyboard.sample(repeat, 0); assert.ok(keyboard.sample(repeat, 1));
  const shown = blink.sample(repeat, 0); blink.acknowledge(shown, 0);
  assert.ok(keyboard.sample(repeat, 1)); assert.equal(blink.sample(repeat, 1), null);
  keyboard.acknowledge(failed, 1); assert.equal(keyboard.sample(repeat, 2), null);
  fill(keyboard, 21, 'nearby', 300001); blink.observe(eye(), 300001);
  assert.ok(keyboard.sample(repeat, 300001)); assert.ok(blink.sample(repeat, 300001));
});

test('once-per-episode and minimum 10s rate survive quick recovery; late acknowledgements cannot consume a new episode', () => {
  const alerts = createBlinkAlerts(); alerts.observe(eye(), 0); const old = alerts.sample(settings, 0);
  alerts.observe(eye(false), 1); assert.equal(alerts.acknowledge(old, 1), false);
  alerts.observe(eye(), 2); const first = alerts.sample(settings, 2); alerts.acknowledge(first, 2);
  alerts.observe(eye(), 1000); assert.equal(alerts.sample(settings, 1000), null);
  alerts.observe(eye(false), 1001); alerts.observe(eye(), 1002); assert.equal(alerts.sample(settings, 1002), null);
  alerts.observe(eye(), 10_002); assert.ok(alerts.sample(settings, 10_002));
});

test('main validates keyboard averages and owns fixed text and navigation for both coaching kinds', () => {
  for (const score of [null, NaN, Infinity, -1, 70.001, '70']) assert.throws(() => notificationContent({ kind: 'keyboard', score, silent: true }));
  const key = { kind: 'keyboard', score: 70, silent: true, body: 'private input' };
  assert.match(notificationContent(key).body, /20회.*70점/); assert.doesNotMatch(notificationContent(key).body, /private/);
  assert.match(notificationContent({ kind: 'blink', silent: false }).body, /15초/);
  assert.equal(notificationTarget(key), '/learn/keyboard'); assert.equal(notificationTarget({ kind: 'blink', silent: true }), '/learn/upper_body');
});

test('both new kinds obey native foreground gate, individual cleanup and automatic OFF/lock cleanup', async () => {
  const handlers = new Map(), notes = [], targets = []; let allowed = false;
  const clear = registerNotificationHandlers({ handle: (name, fn) => handlers.set(name, fn) }, {
    trusted() {}, supported: () => true, allowed: () => allowed, focus: target => targets.push(target),
    create(options) { const events = new Map(); const note = { options, closed: false,
      once(name, fn) { events.set(name, fn); return this; }, show() { events.get('show')(); }, close() { this.closed = true; }, click() { events.get('click')(); } };
      notes.push(note); return note; },
  });
  const show = input => handlers.get('notifications:show')({}, input);
  for (const input of [{ kind: 'keyboard', score: 0, silent: true }, { kind: 'blink', silent: false }]) {
    assert.equal((await show(input)).status, 'suppressed'); assert.equal(notes.length, 0);
  }
  allowed = true;
  assert.equal((await show({ kind: 'keyboard', score: 0, silent: true })).ok, true);
  assert.equal((await show({ kind: 'blink', silent: false })).ok, true);
  notes[0].click(); notes[1].click(); assert.deepEqual(targets, ['/learn/keyboard', '/learn/upper_body']);
  handlers.get('notifications:clear')({}, 'keyboard'); assert.equal(notes[0].closed, true); assert.equal(notes[1].closed, false);
  clear.automatic(); assert.equal(notes[1].closed, true);
  assert.throws(() => handlers.get('notifications:clear')({}, 'arbitrary'));
});
