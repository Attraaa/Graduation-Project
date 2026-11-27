import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonitorSnapshot } from '../src/features/posture/monitorTypes.ts';
import { createPostureAlerts } from '../src/features/notifications/postureAlerts.ts';
import { readNotificationPreferences } from '../src/features/notifications/preferences.ts';
import { notificationContent } from '../src/features/notifications/contract.ts';
import { registerNotificationHandlers } from '../electron/notificationHandlers.ts';

const settings = { enabled: true, silent: false, scoreThreshold: 70, postureSeconds: 3, keyboardThreshold: 70, keyboardSeconds: 3 };
const toast = { kind: 'blink', silent: false };
const snapshot = (continuousMs, neck = {}, balance = {}) => {
  const empty = createMonitorSnapshot();
  return { ...empty, phase: 'observing',
    neck: { ...empty.neck, currentScore: 100, continuousMs, deviationState: 'near-reference', ...neck },
    balance: { ...empty.balance, currentScore: 100, continuousMs, deviationState: 'near-reference', ...balance } };
};

test('notification preferences validate existing stored values, including legacy strong sound', () => {
  const store = values => ({ getItem: key => values[key] ?? null });
  assert.deepEqual(readNotificationPreferences(store({})), settings);
  assert.deepEqual(readNotificationPreferences(store({ 'postureAI.notifications': 'off', 'postureAI.alertFrequency': '5', 'postureAI.alertStrength': 'soft', 'postureAI.scoreThreshold': '40',
    'postureAI.alertSeconds': '10', 'postureAI.keyboardThreshold': '90', 'postureAI.keyboardAlertSeconds': '30' })),
  { enabled: false, silent: true, scoreThreshold: 40, postureSeconds: 10, keyboardThreshold: 90, keyboardSeconds: 30 });
  assert.deepEqual(readNotificationPreferences(store({ 'postureAI.alertFrequency': 'bad', 'postureAI.alertStrength': 'strong', 'postureAI.scoreThreshold': 'NaN',
    'postureAI.alertSeconds': 'soon', 'postureAI.keyboardThreshold': '' })), settings);
  assert.equal(readNotificationPreferences(store({ 'postureAI.scoreThreshold': '999' })).scoreThreshold, 95);
  assert.deepEqual(readNotificationPreferences(store({ 'postureAI.keyboardThreshold': '12', 'postureAI.alertSeconds': '0', 'postureAI.keyboardAlertSeconds': '600' })),
    { ...settings, keyboardThreshold: 40, postureSeconds: 1, keyboardSeconds: 60 });
  assert.deepEqual(readNotificationPreferences({ getItem() { throw Error(); } }), settings);
});

test('low score includes the threshold and zero, requires the chosen observed seconds, and combines both parts', () => {
  const alerts = createPostureAlerts();
  for (const t of [0, 1000, 2999]) assert.equal(alerts.sample(snapshot(t, { currentScore: 70 }, { currentScore: 0 }), settings, t), null);
  // A duplicate snapshot contributes no time and does not erase already confirmed time.
  assert.equal(alerts.sample(snapshot(2999, { currentScore: 70 }, { currentScore: 0 }), settings, 2999), null);
  const request = alerts.sample(snapshot(3000, { currentScore: 70 }, { currentScore: 0 }), settings, 3000);
  assert.deepEqual(request, { kind: 'posture', silent: false, parts: [{ part: 'neck', score: 70 }, { part: 'balance', score: 0 }] });
  alerts.acknowledge(request, 3000);
  assert.equal(alerts.sample(snapshot(60_000, { currentScore: 60 }), settings, 60_000), null);
  // Ten seconds and a higher score, as chosen in the settings.
  const strict = { ...settings, scoreThreshold: 85, postureSeconds: 10 };
  const other = createPostureAlerts();
  for (const t of [0, 9999]) assert.equal(other.sample(snapshot(t, { currentScore: 85 }), strict, t), null);
  assert.deepEqual(other.sample(snapshot(10_000, { currentScore: 85 }), strict, 10_000).parts, [{ part: 'neck', score: 85 }]);
});

test('a confirmed habit deviation alone does not alert; only the score held for the chosen seconds does', () => {
  const alerts = createPostureAlerts();
  for (const t of [0, 3000, 60_000]) assert.equal(alerts.sample(snapshot(t, { currentScore: 80, deviationState: 'away' }), settings, t), null);
  alerts.sample(snapshot(60_001, { currentScore: 60, deviationState: 'away' }), settings, 60_001);
  const request = alerts.sample(snapshot(63_001, { currentScore: 60, deviationState: 'away' }), settings, 63_001);
  assert.match(notificationContent(request).body, /목 60점 · 점수 저하/);
});

test('coaching alerts once per episode and a new episode observes a five-second cooldown', () => {
  const alerts = createPostureAlerts();
  const low = t => snapshot(t, { currentScore: 50 });
  const quiet = { ...settings, silent: true };
  assert.equal(alerts.sample(low(0), quiet, 0), null);
  const first = alerts.sample(low(3000), quiet, 3000);
  assert.equal(first.silent, true); alerts.acknowledge(first, 3000);
  assert.equal(alerts.sample(low(3100), quiet, 3100), null);
  alerts.sample(snapshot(3200), settings, 3200);
  assert.equal(alerts.sample(low(3300), settings, 3300), null);
  assert.equal(alerts.sample(low(7999), settings, 7999), null);
  const second = alerts.sample(low(8000), settings, 8000);
  assert.ok(second); alerts.acknowledge(second, 8000);
  assert.equal(alerts.sample(low(500_000), settings, 500_000), null);
});

test('pause, disabled alerts and unavailable observations cannot accumulate warning time', () => {
  for (const interrupt of [
    (alerts, t) => alerts.interrupt(),
    (alerts, t) => alerts.sample({ ...snapshot(t), phase: 'unavailable' }, settings, t),
    (alerts, t) => alerts.sample(snapshot(t, { currentScore: 60 }), { ...settings, enabled: false }, t),
    (alerts, t) => alerts.sample(snapshot(t, { currentScore: null, deviationState: 'away' }), settings, t),
  ]) {
    const alerts = createPostureAlerts();
    alerts.sample(snapshot(0, { currentScore: 60 }), settings, 0);
    alerts.sample(snapshot(2900, { currentScore: 60 }), settings, 2900);
    interrupt(alerts, 2950);
    assert.equal(alerts.sample(snapshot(3000, { currentScore: 60 }), settings, 3000), null);
    assert.equal(alerts.sample(snapshot(5999, { currentScore: 60 }), settings, 5999), null);
    assert.ok(alerts.sample(snapshot(6000, { currentScore: 60 }), settings, 6000));
  }
});

test('observation continuity reset starts low-score confirmation again; session reset clears cooldown', () => {
  const alerts = createPostureAlerts();
  alerts.sample(snapshot(1000, { currentScore: 60 }), settings, 1000);
  alerts.sample(snapshot(3900, { currentScore: 60 }), settings, 3900);
  assert.equal(alerts.sample(snapshot(0, { currentScore: 60 }), settings, 10_000), null);
  assert.equal(alerts.sample(snapshot(2999, { currentScore: 60 }), settings, 12_999), null);
  const request = alerts.sample(snapshot(3000, { currentScore: 60 }), settings, 13_000);
  assert.ok(request); alerts.acknowledge(request, 13_000);
  alerts.reset();
  assert.equal(alerts.sample(snapshot(0, { currentScore: 60 }), settings, 13_001), null);
  assert.ok(alerts.sample(snapshot(3000, { currentScore: 60 }), settings, 16_001));
});

function harness({ trusted = true, supported = true, outcome = 'show', allowed = () => true } = {}) {
  const handlers = new Map(), notifications = [];
  let focused = 0;
  const clear = registerNotificationHandlers({ handle: (name, handler) => handlers.set(name, handler) }, {
    trusted: () => { if (!trusted) throw Error('untrusted'); }, supported: () => supported,
    allowed,
    focus: () => { focused++; },
    create: options => {
      const listeners = new Map();
      const notification = { options, closed: false, once(event, callback) { listeners.set(event, callback); return this; },
        show() { if (outcome === 'throw') throw Error('native failure'); if (outcome) listeners.get(outcome)?.(); },
        close() { this.closed = true; }, click() { listeners.get('click')?.(); } };
      notifications.push(notification);
      return notification;
    },
  });
  return { show: input => handlers.get('notifications:show')({}, input), clear, notifications, focused: () => focused };
}

test('native IPC validates trusted sender and payload before creating a toast', async () => {
  await assert.rejects(harness({ trusted: false }).show(toast), /untrusted/);
  for (const input of [null, {}, { kind: 'test', silent: false }, { kind: 'blink', silent: 'no' }, { kind: 'posture', silent: false, parts: [] },
    { kind: 'posture', silent: false, parts: [{ part: 'neck', score: NaN }] },
    { kind: 'posture', silent: false, parts: [{ part: 'neck', score: 101 }] },
    { kind: 'posture', silent: false, parts: [{ part: 'eye', score: 60 }] },
    { kind: 'posture', silent: false, parts: [{ part: 'neck', score: 60 }, { part: 'neck', score: 60 }] },
  ]) await assert.rejects(harness().show(input));
  const unavailable = harness({ supported: false });
  assert.equal((await unavailable.show(toast)).ok, false);
  assert.equal(unavailable.notifications.length, 0);
});

test('native toast shows fixed Moti text, sound preference, click focuses app, clear closes it', async () => {
  const native = harness();
  assert.equal((await native.show({ ...toast, silent: true })).ok, true);
  assert.equal(native.notifications[0].options.silent, true);
  assert.match(native.notifications[0].options.title, /깜빡여 주세요/);
  native.notifications[0].click(); assert.equal(native.focused(), 1);
  native.clear(); assert.equal(native.notifications[0].closed, true);
  native.notifications[0].click(); assert.equal(native.focused(), 1);
  assert.equal((await native.show(toast)).ok, false);
});

test('native delivery failures, exceptions, and cancellation are reported instead of false success', async () => {
  for (const outcome of ['failed', 'throw']) assert.equal((await harness({ outcome }).show(toast)).ok, false);
  const pending = harness({ outcome: null });
  const result = pending.show(toast); pending.clear();
  assert.equal((await result).ok, false);
});

test('a blink alert cannot throttle away the first posture warning', async () => {
  const native = harness();
  assert.equal((await native.show(toast)).ok, true);
  assert.equal((await native.show({ kind: 'posture', silent: false, parts: [{ part: 'neck', score: 60 }] })).ok, true);
  assert.equal(native.notifications[0].closed, false);
  assert.match(native.notifications[1].options.body, /목 60점/);
});

test('missing native delivery events time out without reporting success', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = harness({ outcome: null });
  const result = pending.show(toast);
  context.mock.timers.tick(5000);
  assert.equal((await result).ok, false);
  pending.clear();
});

test('foreground suppression does not consume native delivery rate limits', async () => {
  let allowed = false;
  const native = harness({ allowed: () => allowed });
  const request = { kind: 'posture', silent: true, parts: [{ part: 'neck', score: 50 }] };
  assert.equal((await native.show(request)).status, 'suppressed'); assert.equal(native.notifications.length, 0);
  allowed = true; assert.equal((await native.show(request)).ok, true);
});

test('suppressed or failed posture proposals do not consume cooldown; acknowledgements from old episodes are ignored', () => {
  const alerts = createPostureAlerts();
  const low = t => snapshot(t, { currentScore: 50 });
  alerts.sample(low(0), settings, 0);
  const first = alerts.sample(low(3000), settings, 3000); assert.ok(alerts.sample(low(4000), settings, 4000));
  alerts.sample(snapshot(5000), settings, 5000); alerts.acknowledge(first, 5000);
  alerts.sample(low(6000), settings, 6000);
  const second = alerts.sample(low(9000), settings, 9000); assert.ok(second);
  alerts.acknowledge(second, 9000); assert.equal(alerts.sample(low(10_000), settings, 10_000), null);
  alerts.reset(); alerts.acknowledge(second, 10_001);
  alerts.sample(low(0), settings, 10_001);
  assert.ok(alerts.sample(low(3000), settings, 13_001));
});

test('operational issues have fixed safe text and independent limits and cannot be cleared by posture cleanup', async () => {
  const native = harness();
  await native.show({ kind: 'posture', silent: true, parts: [{ part: 'neck', score: 50 }] });
  assert.equal((await native.show({ kind: 'issue', code: 'upper-analysis', silent: false, message: 'never expose secret' })).ok, true);
  assert.equal((await native.show({ kind: 'issue', code: 'storage', silent: false })).ok, true);
  assert.equal((await native.show({ kind: 'issue', code: 'keyboard-area', silent: false })).ok, true);
  assert.equal(native.notifications[3].options.title, 'Moti · 키보드 영역을 맞춰 주세요');
  native.clear('posture'); assert.equal(native.notifications[1].closed, false); assert.equal(native.notifications[2].closed, false);
  assert.doesNotMatch(native.notifications[1].options.body, /secret/);
  await assert.rejects(native.show({ kind: 'issue', code: 'arbitrary', silent: false }));
  native.clear();
});
