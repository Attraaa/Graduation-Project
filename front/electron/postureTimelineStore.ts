import { mkdir, open, readdir, readFile, rm } from 'node:fs/promises';
import { readReviewSession, type ReviewSession } from '../src/features/records/reviewSession.ts';
import { join, sep } from 'node:path';
import { savePostureTimelineSummary } from './postureTimelineSummaryFile.ts';
import {
  POSTURE_TIMELINE_BATCH_SIZE, isPostureTimelineMeasure, postureTimelineEnd, postureTimelineHeader, postureTimelineSample,
  type PostureTimelineBatch,
} from '../src/features/records/postureTimelineContract.ts';

const accountDirectory = (root: string, owner: unknown) => {
  if (typeof owner !== 'string' || !/^[0-9]{1,20}$/.test(owner)) throw new Error('잘못된 기록 계정입니다.');
  return join(root, `account-${owner}`);
};

const isNumberBetween = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const isPolicy = (value: unknown) => typeof value === 'string' && /^[a-z0-9.:_-]{1,100}$/i.test(value);
const isBatch = (input: unknown): input is PostureTimelineBatch => {
  const batch = input as Partial<PostureTimelineBatch> | null;
  const session = batch?.session;
  return !!session && typeof session.id === 'string'
    && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(session.id)
    && isNumberBetween(session.startedAt, 0, Number.MAX_SAFE_INTEGER)
    && isPolicy(session.scorePolicyVersions?.neck) && isPolicy(session.scorePolicyVersions?.shoulder)
    && isPolicy(session.habitPolicyVersion)
    && (batch.endedAt === null || isNumberBetween(batch.endedAt, session.startedAt, Number.MAX_SAFE_INTEGER))
    && Array.isArray(batch.points) && batch.points.length <= POSTURE_TIMELINE_BATCH_SIZE
    && batch.points.every((point, index, points) => !!point && Number.isSafeInteger(point.second) && point.second > 0
      && (index === 0 || point.second === points[index - 1].second + 1)
      && isPostureTimelineMeasure(point.neck, point.neckValidMs) && isPostureTimelineMeasure(point.shoulder, point.shoulderValidMs));
};

type Position = { created: boolean; bytes: number; nextSecond: number };

export function createPostureTimelineStore(root: string) {
  const positions = new Map<string, Position>();
  let pending: Promise<unknown> = Promise.resolve();
  // Clearing an account must take place after its in-flight writes, including failed writes.
  const enqueue = <T>(operation: () => Promise<T>) => {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  };

  const write = (input: unknown) => enqueue(async () => {
    if (!isBatch(input)) throw new Error('잘못된 상체 기록입니다.');
    const { owner, session, points, endedAt } = input;
    const directory = accountDirectory(root, owner);
    const filename = join(directory, `${session.id}.jsonl`);
    const position = positions.get(filename) ?? { created: false, bytes: 0, nextSecond: 1 };
    if (points.length && points[0].second !== position.nextSecond) throw new Error('상체 기록의 시간 순서가 올바르지 않습니다.');
    if (!position.created && !points.length) return;

    const rows = [
      ...(position.bytes ? [] : [postureTimelineHeader(session)]),
      ...points.map(postureTimelineSample),
      ...(endedAt === null ? [] : [postureTimelineEnd(endedAt)]),
    ];
    if (!rows.length) return;
    const bytes = Buffer.from(rows.map(row => JSON.stringify(row)).join('\n') + '\n');
    if (!position.created) await mkdir(directory, { recursive: true });
    const file = await open(filename, position.created ? 'r+' : 'wx+', 0o600);
    position.created = true;
    positions.set(filename, position);
    try {
      // Keep the committed byte position until the write succeeds so retries overwrite a partial batch.
      let written = 0;
      while (written < bytes.length) {
        const { bytesWritten } = await file.write(bytes, written, bytes.length - written, position.bytes + written);
        if (!bytesWritten) throw new Error('상체 기록 파일에 쓸 수 없습니다.');
        written += bytesWritten;
      }
      await file.truncate(position.bytes + written);
      if (endedAt !== null) await file.sync();
    } finally {
      await file.close();
    }
    if (endedAt !== null) await savePostureTimelineSummary(filename, join(directory, `${session.id}.summary.json`));
    position.bytes += bytes.length;
    position.nextSecond += points.length;
    if (endedAt !== null) positions.delete(filename);
  });

  const clear = (owner: unknown) => enqueue(async () => {
    const directory = accountDirectory(root, owner);
    await rm(directory, { recursive: true, force: true });
    for (const filename of positions.keys()) {
      if (filename.startsWith(directory + sep)) positions.delete(filename);
    }
  });

  const read = (owner: unknown, from: number, to: number) => enqueue(async () => {
    const directory = accountDirectory(root, owner);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) throw new Error('잘못된 조회 기간입니다.');
    const files = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const sessions: ReviewSession[] = [];
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.summary.json')) continue;
      const raw = await readFile(join(directory, file.name), 'utf8');
      try {
        const session = readReviewSession(JSON.parse(raw), from, to);
        if (session) sessions.push(session);
      } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    }
    return sessions;
  });
  return { write, read, clear };
}
