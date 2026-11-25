import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeyboardAlerts, createBlinkAlerts } from '../src/features/notifications/activityAlerts.ts';
import { initialKeyboardSnapshot } from '../src/features/keyboard/monitorTypes.ts';
import { addLiveScore } from '../src/features/keyboard/liveScore.ts';
import { emptyEyeSnapshot, createEyeMeasurement } from '../src/features/eye/measurement.ts';
import { notificationContent, notificationTarget } from '../src/features/notifications/contract.ts';
import { registerNotificationHandlers } from '../electron/notificationHandlers.ts';

// The posture alert score (95) must not apply to the keyboard, whose own is 70 for 3 s here.
const settings = { enabled: true, intervalMinutes: 0, silent: true, scoreThreshold: 95, postureSeconds: 3, keyboardThreshold: 70, keyboardSeconds: 3 };
/** Snapshots as KeyboardMonitor publishes them: each new judged press joins the last-50 window shown at home. */
function typing() {
  let scores = [], last = 0;
  return (id, verdict = 'nearby', extra = {}) => {
    const latest = { id, evaluation: { verdict } };
    const observing = !extra.phase && !extra.observationStatus;
    if (observing && id > last) { last = id; scores = addLiveScore(scores, latest); }
    return { ...initialKeyboardSnapshot, phase: 'ready', observationStatus: 'observing', latest, scores, ...extra };
  };
}
const eye = (openReminder = true, extra = {}) => ({ phase: 'observing', message: '',
  measurement: { ...emptyEyeSnapshot(), calibrated: true, openReminder }, ...extra });
/** 50 judged presses at `now`, then one sample so the held time starts there. */
const fill = (alerts, press, verdict = 'nearby', now = 0, start = 1) => {
  for (let id = start; id < start + 50; id++) alerts.observe(press(id, verdict), now);
  return alerts.sample(settings, now);
};

test('keyboard alerts when the last-50 average stays at or below its own alert score for the chosen seconds', () => {
  const alerts = createKeyboardAlerts(), press = typing();
  for (let id = 1; id <= 49; id++) alerts.observe(press(id), 0);
  assert.equal(alerts.sample(settings, 0), null);  // fewer than 50 judged presses
  alerts.observe(press(50), 0);
  assert.equal(alerts.sample(settings, 0), null);  // exactly 70 counts, but it has not lasted 3 s yet
  alerts.observe(press(51), 2999); assert.equal(alerts.sample(settings, 2999), null);
  alerts.observe(press(52), 3000);
  assert.deepEqual(alerts.sample(settings, 3000), { kind: 'keyboard', silent: true, score: 70 });
  alerts.observe(press(53, 'preferred'), 3001);
  assert.equal(alerts.sample(settings, 3001), null);  // (49 × 70 + 100) / 50 = 70.6 → 71
  // A stricter keyboard rule: 90 or lower for 10 s.
  const strict = { ...settings, keyboardThreshold: 90, keyboardSeconds: 10 };
  alerts.observe(press(54), 4000); assert.equal(alerts.sample(strict, 4000), null);
  alerts.observe(press(55), 13_999); assert.equal(alerts.sample(strict, 13_999), null);
  alerts.observe(press(56), 14_000); assert.equal(alerts.sample(strict, 14_000).score, 71);
});

test('unknown judgments, duplicate and out-of-order ids do not fill or distort the window', () => {
  const alerts = createKeyboardAlerts(), press = typing();
  for (let id = 1; id <= 49; id++) alerts.observe(press(id, 'mismatch'), 0);
  for (const id of [49, 5, 0]) alerts.observe(press(id, 'preferred'), 1);
  alerts.observe(press(50, 'unknown'), 1);
  assert.equal(alerts.sample(settings, 1), null);
  alerts.observe(press(51, 'mismatch'), 2); assert.equal(alerts.sample(settings, 2), null);
  alerts.observe(press(52, 'mismatch'), 3002);
  assert.equal(alerts.sample(settings, 3002).score, 0);
});

test('every rapid input is counted even when display snapshots could be batched', () => {
  const alerts = createKeyboardAlerts(), press = typing();
  fill(alerts, press, 'mismatch', 42);
  alerts.observe(press(51, 'mismatch'), 3042);
  assert.equal(alerts.sample(settings, 3042).score, 0);
});

test('excluded, off, preparing, mapping and failed snapshots restart the held time; retained inputs are not recounted', () => {
  for (const extra of [{ observationStatus: 'excluded' }, { observationStatus: 'off' }, { phase: 'starting' }, { phase: 'mapping' }, { phase: 'error' }]) {
    const alerts = createKeyboardAlerts(), press = typing(); fill(alerts, press);
    alerts.observe(press(51, 'nearby', extra), 2000);
    alerts.observe(press(51), 2001);
    assert.equal(alerts.sample(settings, 3000), null);
    alerts.observe(press(52), 3000); assert.equal(alerts.sample(settings, 3000), null);
    alerts.observe(press(53), 5999); assert.equal(alerts.sample(settings, 5999), null);
    alerts.observe(press(54), 6000); assert.ok(alerts.sample(settings, 6000));
  }
});

test('pause and OFF restart the held time and do not replay a retained press; a new run clears ids and cooldown', () => {
  const alerts = createKeyboardAlerts(), press = typing(); fill(alerts, press);
  alerts.observe(press(51), 3000);
  const first = alerts.sample(settings, 3000); assert.ok(first); alerts.acknowledge(first, 3000);
  alerts.interrupt();
  alerts.observe(press(51), 13_000); assert.equal(alerts.sample(settings, 13_000), null);
  alerts.observe(press(52), 13_001); assert.equal(alerts.sample(settings, 13_001), null);
  alerts.observe(press(53), 16_001); assert.ok(alerts.sample(settings, 16_001));
  alerts.sample({ ...settings, enabled: false }, 16_002);
  assert.equal(alerts.sample(settings, 16_002), null);
  alerts.reset(); const next = typing(); fill(alerts, next, 'nearby', 20_000);
  alerts.observe(next(51), 23_000); assert.ok(alerts.sample(settings, 23_000));
});

test('idle keyboard results cannot alert later; a new judged input can', () => {
  const alerts = createKeyboardAlerts(), press = typing(); fill(alerts, press);
  assert.equal(alerts.sample(settings, 3000), null);
  alerts.observe(press(51, 'unknown'), 3001); assert.equal(alerts.sample(settings, 3001), null);
  alerts.observe(press(52), 3002); assert.ok(alerts.sample(settings, 3002));
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
  const keyboard = createKeyboardAlerts(), blink = createBlinkAlerts(), press = typing();
  const repeat = { ...settings, intervalMinutes: 5 };
  fill(keyboard, press); keyboard.observe(press(51), 3000); blink.observe(eye(), 3000);
  const failed = keyboard.sample(repeat, 3000); assert.ok(keyboard.sample(repeat, 3001));
  const shown = blink.sample(repeat, 3000); blink.acknowledge(shown, 3000);
  assert.ok(keyboard.sample(repeat, 3001)); assert.equal(blink.sample(repeat, 3001), null);
  keyboard.acknowledge(failed, 3001); assert.equal(keyboard.sample(repeat, 3002), null);
  keyboard.observe(press(52), 303_001); blink.observe(eye(), 303_001);
  assert.ok(keyboard.sample(repeat, 303_001)); assert.ok(blink.sample(repeat, 303_001));
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
  for (const score of [null, NaN, Infinity, -1, 100.001, '70']) assert.throws(() => notificationContent({ kind: 'keyboard', score, silent: true }));
  const key = { kind: 'keyboard', score: 70, silent: true, body: 'private input' };
  assert.match(notificationContent(key).body, /50회.*70점/); assert.doesNotMatch(notificationContent(key).body, /private/);
  // The keyboard alert score is the user's own (up to 95), so the text takes any average up to 100.
  assert.match(notificationContent({ kind: 'keyboard', score: 90, silent: true }).body, /90점/);
  assert.match(notificationContent({ kind: 'blink', silent: false }).body, /15초/);
  assert.equal(notificationTarget(key), '/dashboard?mode=keyboard'); assert.equal(notificationTarget({ kind: 'blink', silent: true }), '/dashboard?mode=upper_body');
  assert.equal(notificationTarget({ kind: 'issue', code: 'tracking', silent: true }), '/dashboard?mode=upper_body');
  assert.equal(notificationTarget({ kind: 'issue', code: 'storage', silent: true }), '/dashboard');
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
  notes[0].click(); notes[1].click(); assert.deepEqual(targets, ['/dashboard?mode=keyboard', '/dashboard?mode=upper_body']);
  handlers.get('notifications:clear')({}, 'keyboard'); assert.equal(notes[0].closed, true); assert.equal(notes[1].closed, false);
  clear.automatic(); assert.equal(notes[1].closed, true);
  assert.throws(() => handlers.get('notifications:clear')({}, 'arbitrary'));
});
