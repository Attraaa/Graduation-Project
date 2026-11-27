import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import type { PostureSecond, PostureTimelineStart } from '../src/features/posture/scoreTimeline.ts';
import { isPostureTimelineMeasure } from '../src/features/records/postureTimelineContract.ts';
import { buildPostureTimelineSummary } from '../src/features/records/postureTimelineSummary.ts';

export async function savePostureTimelineSummary(rawFile: string, summaryFile: string) {
  const lines = (await readFile(rawFile, 'utf8')).trimEnd().split(/\r?\n/);
  const session = JSON.parse(lines[0]) as PostureTimelineStart & { type: string; schemaVersion: number };
  const end = JSON.parse(lines[lines.length - 1]) as { type: string; endedAt: number };
  if (session?.type !== 'session' || session.schemaVersion !== 1 || end?.type !== 'end'
    || !Number.isFinite(session.startedAt) || !Number.isFinite(end.endedAt) || end.endedAt < session.startedAt) {
    throw new Error('완료된 상체 기록만 요약할 수 있습니다.');
  }
  const points = lines.slice(1, -1).map((line, index) => {
    const row = JSON.parse(line) as PostureSecond & { type: string };
    if (row?.type !== 'sample' || row.second !== index + 1
      || !isPostureTimelineMeasure(row.neck, row.neckValidMs) || !isPostureTimelineMeasure(row.shoulder, row.shoulderValidMs)) {
      throw new Error('상체 기록의 측정값 또는 시간 순서가 올바르지 않습니다.');
    }
    return row;
  });
  if (!points.length) throw new Error('요약할 상체 점수 구간이 없습니다.');

  const summary = buildPostureTimelineSummary(session, end.endedAt, points);
  const temporaryFile = `${summaryFile}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryFile, JSON.stringify(summary) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporaryFile, summaryFile);
  } finally {
    await rm(temporaryFile, { force: true });
  }
}
