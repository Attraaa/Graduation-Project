import { getCurrentUser } from '../../utils/authStore';
import type { PostureSecond, PostureTimelineSink, PostureTimelineStart } from '../posture/scoreTimeline';
import { POSTURE_TIMELINE_BATCH_SIZE } from './postureTimelineContract';
import { clearBrowserPostureTimelines, writeBrowserPostureTimeline } from './postureTimelineBrowser';
import { localReviewSaved } from './reviewRefresh';
import { announceRecording, registerRecorder } from './recording';

type Entry = {
  owner: string;
  session: PostureTimelineStart;
  pending: PostureSecond[];
  endedAt: number | null;
  error: string | null;
  saving: Promise<void> | null;
  started: boolean;
  flush?: (at: number) => void;
};

const active = new Set<Entry>();
const close = (entry: Entry, endedAt: number) => {
  entry.endedAt ??= Math.max(entry.session.startedAt, endedAt);
};

async function save(entry: Entry) {
  if (entry.saving) return entry.saving;
  entry.saving = Promise.resolve().then(async () => {
    try {
      while (active.has(entry) && (entry.pending.length || entry.endedAt !== null)) {
        const points = entry.pending.slice(0, POSTURE_TIMELINE_BATCH_SIZE);
        const endedAt = points.length === entry.pending.length ? entry.endedAt : null;
        if (points.length || entry.started) {
          const batch = { owner: entry.owner, session: entry.session, points, endedAt };
          const desktop = window.motiRecords;
          await (desktop ? desktop.writePostureTimeline(batch) : writeBrowserPostureTimeline(batch));
          entry.started = true;
          entry.pending.splice(0, points.length);
        }
        if (endedAt !== null) { active.delete(entry); if (entry.started) localReviewSaved(); }
      }
      if (entry.error) {
        entry.error = null;
        announceRecording('상체 초 단위 기록을 이 기기에 저장했습니다.');
      }
    } catch (error) {
      if (!active.has(entry)) return;
      entry.error = '상체 초 단위 기록을 이 기기에 저장할 수 없습니다.';
      announceRecording(entry.error);
      throw error;
    } finally {
      entry.saving = null;
    }
  });
  return entry.saving;
}

registerRecorder({
  retry: async () => { await Promise.all([...active].map(save)); },
  finish: () => { for (const entry of active) { if (entry.endedAt === null) entry.flush?.(performance.now()); close(entry, Date.now()); } },
  discard: owner => {
    for (const entry of active) if (entry.owner === owner) active.delete(entry);
  },
  error: () => [...active].find(entry => entry.error)?.error ?? null,
  failedForOwner: owner => [...active].some(entry => entry.owner === owner && !!entry.error),
});

export const clearLocalPostureTimelines = async (owner: string) => {
  const desktop = window.motiRecords;
  await (desktop ? desktop.clearPostureTimelines(owner) : clearBrowserPostureTimelines(owner));
};

export function beginPostureTimeline(session: PostureTimelineStart): PostureTimelineSink & { onStop(flush: (at: number) => void): void } {
  const owner = getCurrentUser()?.id;
  if (!owner) return { append: () => {}, finish: () => {}, onStop: () => {} };
  const entry: Entry = { owner, session, pending: [], endedAt: null, error: null, saving: null, started: false };
  active.add(entry);
  return {
    onStop(flush) { entry.flush = flush; },
    append(points) {
      if (!points.length || !active.has(entry) || entry.endedAt !== null) return;
      for (const point of points) entry.pending.push(point);
      void save(entry).catch(() => {});
    },
    finish(endedAt) {
      if (!active.has(entry)) return;
      close(entry, endedAt);
      void save(entry).catch(() => {});
    },
  };
}
