import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendKeystrokeEvents, appendSessionLogs, parseCalibrationReference, parseKeystrokeEvents,
  parseSessionLogs, saveCalibrationReference, MAX_BATCH_ENTRIES,
  type CalibrationReference, type KeystrokeEvent, type Session, type SessionLog,
  type SessionRepository, type SessionTransaction,
} from '../src/services/sessions.js';

// 실제 DB를 고르지 않고도 소유권·종료·중복 경계를 검사하기 위한 대역 저장소입니다.
class MemorySessions implements SessionRepository {
  session: Session = { id: 10, user_id: 1, ended_at: null };
  logs: SessionLog[] = [];
  keystrokes: KeystrokeEvent[] = [];
  calibration: CalibrationReference | null = null;

  transaction<T>(work: (transaction: SessionTransaction) => Promise<T>): Promise<T> {
    return work({
      findOwnedForUpdate: async (id, userId) =>
        this.session.id === id && this.session.user_id === userId ? this.session : null,
      finish: async () => undefined,
      aggregate: async () => undefined,
      appendLogs: async (_id, _userId, entries) => { this.logs.push(...entries); },
      saveCalibration: async (_id, _userId, reference) => {
        if (this.calibration) return false;
        this.calibration = reference;
        return true;
      },
      appendKeystrokes: async (_id, _userId, events) => { this.keystrokes.push(...events); },
    });
  }
}

const reference = {
  schemaVersion: 1,
  sourceId: 'track-1',
  widthPx: 1280,
  heightPx: 720,
  sampleCount: 24,
  startedAtMs: 10_000.5,
  completedAtMs: 13_100.5,
  metrics: {
    noseOffsetShoulderWidths: -0.02,
    noseHeightShoulderWidths: 0.61,
    shoulderHeightDifferenceShoulderWidths: 0.03,
  },
};

const keystroke = {
  keyCode: 'KeyF',
  observedFinger: 'left:index',
  verdict: 'preferred',
  reason: 'preferred-finger',
  confidence: 0.82,
  frameDeltaMs: -35,
  policyId: 'ansi-qwerty-touch',
  policyVersion: '1.0.0',
};

test('a log keeps the metric with its value and refuses a value while unobservable', () => {
  const parsed = parseSessionLogs({ logs: [{ status: 'GOOD', metric: 'nose_height', measuredValue: 0.61, elapsedMs: 1200 }] });
  assert.deepEqual(parsed, [{ status: 'GOOD', metric: 'nose_height', measuredValue: 0.61, elapsedMs: 1200 }]);
  // 관찰이 끊긴 구간은 좋은 자세도 나쁜 자세도 아니며 값도 없습니다.
  assert.deepEqual(parseSessionLogs({ logs: [{ status: 'UNAVAILABLE' }] }),
    [{ status: 'UNAVAILABLE', metric: null, measuredValue: null, elapsedMs: null }]);
  for (const entry of [
    { status: 'UNAVAILABLE', metric: 'nose_height', measuredValue: 0.2 },
    { status: 'GOOD', measuredValue: 0.2 },
    { status: 'GOOD', metric: 'nose_height' },
    { status: 'GOOD', metric: 'neck_angle', measuredValue: 0.2 },
    { status: 'FINE' },
  ]) {
    assert.throws(() => parseSessionLogs({ logs: [entry] }), { status: 400 }, JSON.stringify(entry));
  }
});

test('a log batch is bounded so one request cannot insert an unbounded number of rows', () => {
  const entry = { status: 'GOOD', metric: 'nose_offset', measuredValue: 0 };
  assert.equal(parseSessionLogs({ logs: Array(MAX_BATCH_ENTRIES).fill(entry) }).length, MAX_BATCH_ENTRIES);
  assert.throws(() => parseSessionLogs({ logs: Array(MAX_BATCH_ENTRIES + 1).fill(entry) }), { status: 400 });
  assert.throws(() => parseSessionLogs({ logs: [] }), { status: 400 });
  assert.throws(() => parseSessionLogs({ logs: entry }), { status: 400 });
});

test('calibration stores the collected duration, not the monotonic clock readings', () => {
  const parsed = parseCalibrationReference(reference);
  // startedAtMs/completedAtMs는 performance.now() 값이라 시각으로 저장하면 의미가 없습니다.
  assert.equal(parsed.collectedMs, 3100);
  assert.equal('startedAtMs' in parsed, false);
  assert.deepEqual(
    [parsed.noseOffset, parsed.noseHeight, parsed.shoulderDiff],
    [-0.02, 0.61, 0.03],
  );
});

test('calibration rejects reversed, oversized, and incomplete acquisitions', () => {
  for (const change of [
    { completedAtMs: 9_000 },
    { completedAtMs: 10_000.5 + 3_600_001 },
    { sampleCount: 0 },
    { widthPx: 0 },
    { sourceId: '' },
    { schemaVersion: 0 },
    { metrics: { noseOffsetShoulderWidths: 0, noseHeightShoulderWidths: 0 } },
    { metrics: { ...reference.metrics, noseHeightShoulderWidths: Number.POSITIVE_INFINITY } },
  ]) {
    assert.throws(() => parseCalibrationReference({ ...reference, ...change }), { status: 400 }, JSON.stringify(change));
  }
});

test('a keystroke verdict and its observation are accepted or withheld together', () => {
  assert.equal(parseKeystrokeEvents({ events: [keystroke] })[0].observedFinger, 'left:index');
  assert.deepEqual(
    parseKeystrokeEvents({ events: [{ ...keystroke, verdict: 'unknown', reason: 'ambiguous-candidates', observedFinger: null, confidence: null }] })[0].verdict,
    'unknown',
  );
  for (const change of [
    // 판정 보류를 손가락 이름과 함께 저장하면 통계의 분모가 오염됩니다.
    { verdict: 'unknown', reason: 'ambiguous-candidates', confidence: null },
    { verdict: 'unknown', reason: 'ambiguous-candidates', observedFinger: null },
    { observedFinger: null, confidence: null },
    { observedFinger: 'left:palm' },
    { verdict: 'wrong' },
    { confidence: 1.5 },
    { frameDeltaMs: 40000 },
  ]) {
    assert.throws(() => parseKeystrokeEvents({ events: [{ ...keystroke, ...change }] }), { status: 400 }, JSON.stringify(change));
  }
});

test('measurement writes require an owned session that is still open', async () => {
  const parsed = parseCalibrationReference(reference);
  const events = parseKeystrokeEvents({ events: [keystroke] });
  const logs = parseSessionLogs({ logs: [{ status: 'GOOD', metric: 'nose_offset', measuredValue: 0.1 }] });

  const other = new MemorySessions();
  await assert.rejects(saveCalibrationReference(other, 2, 10, parsed), { status: 404 });
  await assert.rejects(appendKeystrokeEvents(other, 2, 10, events), { status: 404 });
  await assert.rejects(appendSessionLogs(other, 2, 10, logs), { status: 404 });
  assert.equal(other.calibration, null);
  assert.deepEqual(other.keystrokes, []);

  const ended = new MemorySessions();
  ended.session = { id: 10, user_id: 1, ended_at: '2026-09-06T01:00:00Z' };
  await assert.rejects(saveCalibrationReference(ended, 1, 10, parsed), { status: 409 });
  await assert.rejects(appendKeystrokeEvents(ended, 1, 10, events), { status: 409 });
  await assert.rejects(appendSessionLogs(ended, 1, 10, logs), { status: 409 });
});

test('a session keeps one reference posture so stored observations stay interpretable', async () => {
  const repository = new MemorySessions();
  const parsed = parseCalibrationReference(reference);
  await saveCalibrationReference(repository, 1, 10, parsed);
  assert.deepEqual(repository.calibration, parsed);
  // 기준을 덮어쓰면 이미 저장한 관측값의 비교 대상이 조용히 바뀝니다.
  await assert.rejects(
    saveCalibrationReference(repository, 1, 10, { ...parsed, noseHeight: 0.9 }),
    { status: 409 },
  );
  assert.equal(repository.calibration?.noseHeight, 0.61);
});
