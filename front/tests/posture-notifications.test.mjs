import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonitorSnapshot } from '../src/features/posture/monitorTypes.ts';
import { createPostureAlerts } from '../src/features/notifications/postureAlerts.ts';
import { readNotificationPreferences } from '../src/features/notifications/preferences.ts';
import { notificationContent } from '../src/features/notifications/contract.ts';
import { registerNotificationHandlers } from '../electron/notificationHandlers.ts';

const settings = { enabled: true, intervalMinutes: 0, silent: false, scoreThreshold: 70 };
const snapshot = (continuousMs, neck = {}, shoulder = {}) => {
  const empty = createMonitorSnapshot();
  return { ...empty, phase: 'observing',
    neck: { ...empty.neck, currentScore: 100, protection: 'none', continuousMs, deviationState: 'near-reference', ...neck },
    shoulder: { ...empty.shoulder, currentScore: 100, protection: 'none', continuousMs, deviationState: 'near-reference', ...shoulder } };
};

test('notification preferences validate existing stored values, including legacy strong sound', () => {
  const store = values => ({ getItem: key => values[key] ?? null });
  assert.deepEqual(readNotificationPreferences(store({})), { ...settings, intervalMinutes: 10 });
  assert.deepEqual(readNotificationPreferences(store({ 'postureAI.notifications': 'off', 'postureAI.alertFrequency': '5', 'postureAI.alertStrength': 'soft', 'postureAI.scoreThreshold': '40' })),
    { enabled: false, intervalMinutes: 5, silent: true, scoreThreshold: 40 });
  assert.deepEqual(readNotificationPreferences(store({ 'postureAI.alertFrequency': 'bad', 'postureAI.alertStrength': 'strong', 'postureAI.scoreThreshold': 'NaN' })), { ...settings, intervalMinutes: 10 });
  assert.equal(readNotificationPreferences(store({ 'postureAI.scoreThreshold': '999' })).scoreThreshold, 95);
  assert.deepEqual(readNotificationPreferences({ getItem() { throw Error(); } }), { ...settings, intervalMinutes: 10 });
});

test('low score includes the threshold and zero, requires three observed seconds, and combines both parts', () => {
  const alerts = createPostureAlerts();
  for (const t of [0, 1000, 2999]) assert.equal(alerts.sample(snapshot(t, { currentScore: 70 }, { currentScore: 0 }), settings, t), null);
  // A duplicate snapshot contributes no time and does not erase already confirmed time.
  assert.equal(alerts.sample(snapshot(2999, { currentScore: 70 }, { currentScore: 0 }), settings, 2999), null);
  const request = alerts.sample(snapshot(3000, { currentScore: 70 }, { currentScore: 0 }), settings, 3000);
  assert.deepEqual(request, { kind: 'posture', silent: false, parts: [{ part: 'neck', score: 70, away: false }, { part: 'shoulder', score: 0, away: false }] });
  alerts.acknowledge(request, 3000);
  assert.equal(alerts.sample(snapshot(60_000, { currentScore: 60 }), settings, 60_000), null);
});

test('confirmed deviation uses the existing habit state, pending deviation alone does not alert', () => {
  const alerts = createPostureAlerts();
  assert.equal(alerts.sample(snapshot(0, { deviationState: 'pending' }), settings, 0), null);
  const request = alerts.sample(snapshot(2000, { currentScore: 80, deviationState: 'away' }), settings, 2000);
  assert.equal(request.parts[0].away, true);
  assert.match(notificationContent(request).body, /목 80점 · 기준 자세에서 벗어남/);
});

test('cooldown applies across recovered episodes; repeat intervals never delay the first alert', () => {
  const alerts = createPostureAlerts();
  const away = t => snapshot(t, { currentScore: 50, deviationState: 'away' });
  const repeat = { ...settings, intervalMinutes: 5, silent: true };
  const first = alerts.sample(away(0), repeat, 0);
  assert.equal(first.silent, true); alerts.acknowledge(first, 0);
  assert.equal(alerts.sample(away(299999), repeat, 299999), null);
  const repeated = alerts.sample(away(300000), repeat, 300000);
  assert.ok(repeated); alerts.acknowledge(repeated, 300000);
  alerts.sample(snapshot(300100), settings, 300100);
  assert.equal(alerts.sample(away(300200), settings, 300200), null);
  assert.ok(alerts.sample(away(310000), settings, 310000));
});

test('pause, disabled alerts, unavailable observations, and protected scores cannot accumulate warning time', () => {
  for (const interrupt of [
    (alerts, t) => alerts.interrupt(),
    (alerts, t) => alerts.sample({ ...snapshot(t), phase: 'unavailable' }, settings, t),
    (alerts, t) => alerts.sample(snapshot(t, { currentScore: 60 }), { ...settings, enabled: false }, t),
    ...['moving', 'grace', 'recovering'].map(protection => (alerts, t) => {
      assert.equal(alerts.sample(snapshot(t, { currentScore: 0, deviationState: 'away', protection }), settings, t), null);
    }),
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
  assert.ok(alerts.sample(snapshot(3000, { currentScore: 60 }), settings, 13_000));
  alerts.reset();
  assert.ok(alerts.sample(snapshot(0, { deviationState: 'away' }), settings, 13_001));
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
  await assert.rejects(harness({ trusted: false }).show({ kind: 'test', silent: false }), /untrusted/);
  for (const input of [null, {}, { kind: 'test', silent: 'no' }, { kind: 'posture', silent: false, parts: [] },
    { kind: 'posture', silent: false, parts: [{ part: 'neck', score: NaN, away: false }] },
    { kind: 'posture', silent: false, parts: [{ part: 'neck', score: 101, away: false }] },
    { kind: 'posture', silent: false, parts: [{ part: 'eye', score: 60, away: false }] },
    { kind: 'posture', silent: false, parts: [{ part: 'neck', score: 60, away: false }, { part: 'neck', score: 60, away: true }] },
  ]) await assert.rejects(harness().show(input));
  const unavailable = harness({ supported: false });
  assert.equal((await unavailable.show({ kind: 'test', silent: false })).ok, false);
  assert.equal(unavailable.notifications.length, 0);
});

test('native toast shows fixed Moti text, sound preference, click focuses app, clear closes it', async () => {
  const native = harness();
  assert.equal((await native.show({ kind: 'test', silent: true })).ok, true);
  assert.equal(native.notifications[0].options.silent, true);
  assert.equal(native.notifications[0].options.title, 'Moti · 알림 테스트');
  native.notifications[0].click(); assert.equal(native.focused(), 1);
  native.clear(); assert.equal(native.notifications[0].closed, true);
  native.notifications[0].click(); assert.equal(native.focused(), 1);
  assert.equal((await native.show({ kind: 'test', silent: false })).ok, false);
});

test('native delivery failures, exceptions, and cancellation are reported instead of false success', async () => {
  for (const outcome of ['failed', 'throw']) assert.equal((await harness({ outcome }).show({ kind: 'test', silent: false })).ok, false);
  const pending = harness({ outcome: null });
  const result = pending.show({ kind: 'test', silent: false }); pending.clear();
  assert.equal((await result).ok, false);
});

test('a test notification cannot throttle away the first real posture warning', async () => {
  const native = harness();
  assert.equal((await native.show({ kind: 'test', silent: false })).ok, true);
  assert.equal((await native.show({ kind: 'posture', silent: false, parts: [{ part: 'neck', score: 60, away: false }] })).ok, true);
  assert.equal(native.notifications[0].closed, true);
  assert.match(native.notifications[1].options.body, /목 60점/);
});

test('missing native delivery events time out without reporting success', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = harness({ outcome: null });
  const result = pending.show({ kind: 'test', silent: false });
  context.mock.timers.tick(5000);
  assert.equal((await result).ok, false);
  pending.clear();
});

test('foreground suppression does not consume native delivery rate limits; an explicit test still works', async () => {
  let allowed = false;
  const native = harness({ allowed: () => allowed });
  const request = { kind: 'posture', silent: true, parts: [{ part: 'neck', score: 50, away: true }] };
  assert.equal((await native.show(request)).status, 'suppressed'); assert.equal(native.notifications.length, 0);
  assert.equal((await native.show({ kind: 'test', silent: true })).ok, true);
  allowed = true; assert.equal((await native.show(request)).ok, true);
});

test('suppressed or failed posture proposals do not consume cooldown; acknowledgements from old episodes are ignored', () => {
  const alerts = createPostureAlerts();
  const low = t => snapshot(t, { currentScore: 50, deviationState: 'away' });
  const first = alerts.sample(low(0), settings, 0); assert.ok(alerts.sample(low(1000), settings, 1000));
  alerts.sample(snapshot(2000), settings, 2000); alerts.acknowledge(first, 2000);
  const second = alerts.sample(low(3000), settings, 3000); assert.ok(second);
  alerts.acknowledge(second, 3000); assert.equal(alerts.sample(low(4000), settings, 4000), null);
  alerts.reset(); alerts.acknowledge(second, 4001); assert.ok(alerts.sample(low(0), settings, 4001));
});

test('operational issues have fixed safe text and independent limits and cannot be cleared by posture cleanup', async () => {
  const native = harness();
  await native.show({ kind: 'posture', silent: true, parts: [{ part: 'neck', score: 50, away: true }] });
  assert.equal((await native.show({ kind: 'issue', code: 'upper-analysis', silent: false, message: 'never expose secret' })).ok, true);
  assert.equal((await native.show({ kind: 'issue', code: 'storage', silent: false })).ok, true);
  native.clear('posture'); assert.equal(native.notifications[1].closed, false); assert.equal(native.notifications[2].closed, false);
  assert.doesNotMatch(native.notifications[1].options.body, /secret/);
  await assert.rejects(native.show({ kind: 'issue', code: 'arbitrary', silent: false }));
  native.clear();
});
