import { HttpError } from '../http.js';
import { bodyObject, choice, decimal, integer, list, optional, text, FLOAT_MAX } from '../validation.js';

export const SESSION_MODES = ['turtle', 'shoulder', 'keyboard', 'eye'] as const;
export type SessionMode = typeof SESSION_MODES[number];
export const POSTURE_STATUSES = ['GOOD', 'WARNING', 'DANGER', 'UNAVAILABLE'] as const;
export type PostureStatus = typeof POSTURE_STATUSES[number];
export const POSTURE_METRICS = ['nose_offset', 'nose_height', 'shoulder_diff'] as const;
export type PostureMetric = typeof POSTURE_METRICS[number];
export const FINGER_VERDICTS = ['preferred', 'acceptable', 'mismatch', 'unknown'] as const;
export type FingerVerdict = typeof FINGER_VERDICTS[number];

/** 한 번의 요청이 넣을 수 있는 행 수. express.json 기본 본문 한도 안에 들어가는 크기입니다. */
export const MAX_BATCH_ENTRIES = 200;
const MAX_ELAPSED_MS = 86_400_000;
const MAX_CALIBRATION_MS = 3_600_000;
const FINGER_PATTERN = /^(left|right):(thumb|index|middle|ring|pinky)$/;

export interface Session {
  id: number;
  user_id: number;
  ended_at: Date | string | null;
}
export interface SessionEnd { score: number; alertCount: number }

export interface SessionLog {
  status: PostureStatus;
  metric: PostureMetric | null;
  measuredValue: number | null;
  /** 세션 시작 이후 경과 시간. 클라이언트의 시계가 아니라 구간 길이입니다. */
  elapsedMs: number | null;
}

/** 프론트 CalibrationReference의 저장 형태. 세 지표는 어깨 너비 대비 비율입니다. */
export interface CalibrationReference {
  schemaVersion: number;
  sourceId: string;
  widthPx: number;
  heightPx: number;
  sampleCount: number;
  collectedMs: number;
  noseOffset: number;
  noseHeight: number;
  shoulderDiff: number;
}

export interface KeystrokeEvent {
  keyCode: string;
  observedFinger: string | null;
  verdict: FingerVerdict;
  reason: string;
  confidence: number | null;
  frameDeltaMs: number | null;
  policyId: string;
  policyVersion: string;
  elapsedMs: number | null;
}

export interface SessionTransaction {
  findOwnedForUpdate(id: number, userId: number): Promise<Session | null>;
  finish(id: number, result: SessionEnd): Promise<void>;
  aggregate(id: number, userId: number): Promise<void>;
  appendLogs(id: number, userId: number, logs: readonly SessionLog[]): Promise<void>;
  /** 이미 기준 자세가 있으면 덮어쓰지 않고 false를 돌려줍니다. */
  saveCalibration(id: number, userId: number, reference: CalibrationReference): Promise<boolean>;
  appendKeystrokes(id: number, userId: number, events: readonly KeystrokeEvent[]): Promise<void>;
}
export interface SessionRepository {
  transaction<T>(work: (transaction: SessionTransaction) => Promise<T>): Promise<T>;
}

export function parseMode(value: unknown): SessionMode {
  if (!SESSION_MODES.includes(value as SessionMode)) throw new HttpError(400, '지원하지 않는 측정 모드입니다.');
  return value as SessionMode;
}

export function parseSessionEnd(value: unknown): SessionEnd {
  const input = bodyObject(value);
  // Legacy storage contract only. The future measurement score formula is not defined here.
  return {
    score: integer(input.score, 'score', 0, 100),
    alertCount: integer(input.alertCount, 'alertCount', 0, 2147483647),
  };
}

function readLog(input: Record<string, unknown>): SessionLog {
  const status = choice(input.status, 'status', POSTURE_STATUSES);
  const metric = optional(input.metric, value => choice(value, 'metric', POSTURE_METRICS));
  const measuredValue = optional(input.measuredValue, value => decimal(value, 'measuredValue', -FLOAT_MAX, FLOAT_MAX));
  // 어느 지표의 값인지 모르면 나중에 해석할 수 없습니다. 값과 지표는 함께 오거나 함께 없어야 합니다.
  if ((metric === null) !== (measuredValue === null)) {
    throw new HttpError(400, 'metric과 measuredValue는 함께 보내야 합니다.');
  }
  // 관찰이 끊긴 구간에는 측정값이 없습니다. 빈 값을 0이나 다른 상태로 바꾸지 않습니다.
  if (status === 'UNAVAILABLE' && measuredValue !== null) {
    throw new HttpError(400, 'UNAVAILABLE 상태에는 측정값을 보낼 수 없습니다.');
  }
  return {
    status,
    metric,
    measuredValue,
    elapsedMs: optional(input.elapsedMs, value => integer(value, 'elapsedMs', 0, MAX_ELAPSED_MS)),
  };
}

export function parseSessionLog(value: unknown): SessionLog {
  return readLog(bodyObject(value));
}

export function parseSessionLogs(value: unknown): SessionLog[] {
  return list(bodyObject(value).logs, 'logs', MAX_BATCH_ENTRIES).map(entry => readLog(bodyObject(entry)));
}

export function parseCalibrationReference(value: unknown): CalibrationReference {
  const input = bodyObject(value);
  const metrics = bodyObject(input.metrics);
  // startedAtMs/completedAtMs는 performance.now() 단조 시계입니다. 벽시계 시각이 아니므로
  // 시각으로 저장하지 않고 수집에 걸린 길이만 남깁니다.
  const startedAtMs = decimal(input.startedAtMs, 'startedAtMs', 0, Number.MAX_SAFE_INTEGER);
  const completedAtMs = decimal(input.completedAtMs, 'completedAtMs', 0, Number.MAX_SAFE_INTEGER);
  const collectedMs = Math.round(completedAtMs - startedAtMs);
  if (collectedMs < 0 || collectedMs > MAX_CALIBRATION_MS) {
    throw new HttpError(400, '기준 자세 수집 구간이 올바르지 않습니다.');
  }
  return {
    // 알 수 없는 버전을 거절하지 않고 그대로 남깁니다. 해석 책임은 읽는 쪽에 있습니다.
    schemaVersion: integer(input.schemaVersion, 'schemaVersion', 1, 32767),
    sourceId: text(input.sourceId, 'sourceId', 128),
    widthPx: integer(input.widthPx, 'widthPx', 1, 16384),
    heightPx: integer(input.heightPx, 'heightPx', 1, 16384),
    sampleCount: integer(input.sampleCount, 'sampleCount', 1, 32767),
    collectedMs,
    noseOffset: decimal(metrics.noseOffsetShoulderWidths, 'noseOffsetShoulderWidths', -FLOAT_MAX, FLOAT_MAX),
    noseHeight: decimal(metrics.noseHeightShoulderWidths, 'noseHeightShoulderWidths', -FLOAT_MAX, FLOAT_MAX),
    shoulderDiff: decimal(metrics.shoulderHeightDifferenceShoulderWidths, 'shoulderHeightDifferenceShoulderWidths', -FLOAT_MAX, FLOAT_MAX),
  };
}

export function parseKeystrokeEvents(value: unknown): KeystrokeEvent[] {
  return list(bodyObject(value).events, 'events', MAX_BATCH_ENTRIES).map(entry => {
    const input = bodyObject(entry);
    const verdict = choice(input.verdict, 'verdict', FINGER_VERDICTS);
    const observedFinger = optional(input.observedFinger, value => {
      const finger = text(value, 'observedFinger', 16);
      if (!FINGER_PATTERN.test(finger)) throw new HttpError(400, 'observedFinger 형식은 left:index와 같아야 합니다.');
      return finger;
    });
    const confidence = optional(input.confidence, value => decimal(value, 'confidence', 0, 1));
    // 판정 보류에는 관측된 손가락도 신뢰도도 없습니다. 보류를 오사용으로 바꾸지 않기 위한 경계입니다.
    if ((verdict === 'unknown') !== (observedFinger === null) || (verdict === 'unknown') !== (confidence === null)) {
      throw new HttpError(400, 'unknown 판정에는 observedFinger와 confidence가 없어야 하고, 나머지 판정에는 있어야 합니다.');
    }
    return {
      keyCode: text(input.keyCode, 'keyCode', 24),
      observedFinger,
      verdict,
      reason: text(input.reason, 'reason', 32),
      confidence,
      frameDeltaMs: optional(input.frameDeltaMs, value => integer(value, 'frameDeltaMs', -32768, 32767)),
      policyId: text(input.policyId, 'policyId', 32),
      policyVersion: text(input.policyVersion, 'policyVersion', 16),
      elapsedMs: optional(input.elapsedMs, value => integer(value, 'elapsedMs', 0, MAX_ELAPSED_MS)),
    };
  });
}

/** 소유권과 종료 여부를 한 트랜잭션 안에서 확인한 뒤에만 세션에 기록합니다. */
async function withOpenSession<T>(
  repository: SessionRepository,
  userId: number,
  id: number,
  closedMessage: string,
  work: (transaction: SessionTransaction) => Promise<T>,
): Promise<T> {
  return repository.transaction(async (transaction) => {
    const session = await transaction.findOwnedForUpdate(id, userId);
    if (!session) throw new HttpError(404, '세션을 찾을 수 없습니다.');
    if (session.ended_at !== null) throw new HttpError(409, closedMessage);
    return work(transaction);
  });
}

export async function endSession(repository: SessionRepository, userId: number, id: number, result: SessionEnd): Promise<void> {
  await repository.transaction(async (transaction) => {
    const session = await transaction.findOwnedForUpdate(id, userId);
    if (!session) throw new HttpError(404, '세션을 찾을 수 없습니다.');
    // The row lock serializes end/log requests. Retries never replace the first result or add statistics twice.
    if (session.ended_at !== null) return;
    await transaction.finish(id, result);
    await transaction.aggregate(id, userId);
  });
}

export async function appendSessionLogs(repository: SessionRepository, userId: number, id: number, logs: readonly SessionLog[]): Promise<void> {
  await withOpenSession(repository, userId, id, '종료된 세션에는 로그를 추가할 수 없습니다.', (transaction) =>
    transaction.appendLogs(id, userId, logs));
}

export async function appendSessionLog(repository: SessionRepository, userId: number, id: number, log: SessionLog): Promise<void> {
  await appendSessionLogs(repository, userId, id, [log]);
}

export async function saveCalibrationReference(repository: SessionRepository, userId: number, id: number, reference: CalibrationReference): Promise<void> {
  await withOpenSession(repository, userId, id, '종료된 세션에는 기준 자세를 저장할 수 없습니다.', async (transaction) => {
    // 세션당 기준 자세는 한 벌입니다. 덮어쓰면 이미 저장한 관측값의 해석 기준이 바뀝니다.
    if (!await transaction.saveCalibration(id, userId, reference)) {
      throw new HttpError(409, '이 세션에는 이미 기준 자세가 저장되어 있습니다. 기준을 다시 잡으려면 새 세션을 시작해 주세요.');
    }
  });
}

export async function appendKeystrokeEvents(repository: SessionRepository, userId: number, id: number, events: readonly KeystrokeEvent[]): Promise<void> {
  await withOpenSession(repository, userId, id, '종료된 세션에는 키 입력을 추가할 수 없습니다.', (transaction) =>
    transaction.appendKeystrokes(id, userId, events));
}
