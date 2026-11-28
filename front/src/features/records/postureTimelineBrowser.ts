import { postureTimelineEnd, postureTimelineHeader, postureTimelineSample, type PostureTimelineBatch } from './postureTimelineContract';
import { buildPostureTimelineSummary } from './postureTimelineSummary';

import { readDailyTimelineSession, readPostureSecond, readReviewSession, type DailyTimelineSession, type ReviewSession } from './reviewSession';

const STORE = 'posture-timeline';
let opening: Promise<IDBDatabase> | undefined;

function openTimelineDatabase() {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('moti-local-records', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); opening = undefined; };
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  }).catch(error => { opening = undefined; throw error; });
  return opening;
}

async function writeRows(operation: (store: IDBObjectStore) => void) {
  const database = await openTimelineDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('브라우저 기록 저장이 중단되었습니다.'));
    operation(transaction.objectStore(STORE));
  });
}

export const writeBrowserPostureTimeline = ({ owner, session, points, endedAt }: PostureTimelineBatch) =>
  writeRows(store => {
    const key = [owner, session.id];
    store.put(postureTimelineHeader(session), [...key, 0]);
    for (const point of points) store.put(postureTimelineSample(point), [...key, point.second]);
    if (endedAt !== null) {
      store.put(postureTimelineEnd(endedAt), [...key, Infinity]);
      const samples = store.getAll(IDBKeyRange.bound([...key, 1], [...key, Infinity], false, true));
      samples.onsuccess = () => {
        store.put(buildPostureTimelineSummary(session, endedAt, samples.result), [...key, 'summary']);
      };
    }
  });

export async function readBrowserPostureSummaries(owner: string, from: number, to: number) {
  return readBrowserTimeline(owner, (value, _id, _store, result: ReviewSession[]) => {
    const summary = readReviewSession(value, from, to);
    if (summary) result.push(summary);
  });
}

export async function readBrowserPostureDay(owner: string, from: number, to: number) {
  return readBrowserTimeline(owner, (value, id, store, result: DailyTimelineSession[]) => {
    const session = readDailyTimelineSession(value, from, to);
    if (!session || id !== session.id) return;
    const first = Math.max(1, Math.floor((from - session.startedAt) / 1000) + 1);
    const end = Math.ceil((Math.min(to, session.endedAt) - session.startedAt) / 1000);
    if (end < first) return;
    const samples = store.getAll(IDBKeyRange.bound([owner, id, first], [owner, id, end]));
    samples.onsuccess = () => {
      const points = samples.result.flatMap(row => {
        const second = row?.second;
        const point = Number.isInteger(second) && second >= first && second <= end ? readPostureSecond(row, second) : null;
        return point ? [point] : [];
      });
      result.push({ ...session, points });
    };
  });
}

async function readBrowserTimeline<T>(owner: string,
  collect: (value: unknown, id: IDBValidKey, store: IDBObjectStore, result: T[]) => void) {
  const db = await openTimelineDatabase();
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(STORE);
    const store = tx.objectStore(STORE);
    const rows: T[] = [];
    const cursor = store.openCursor(IDBKeyRange.bound([owner], [owner, []], false, true));
    cursor.onsuccess = () => {
      const item = cursor.result;
      if (!item) return;
      const [, id, key] = item.key as IDBValidKey[];
      // Jump over the raw seconds with a composite-key seek, including unfinished sessions.
      if (typeof key === 'number') { item.continue([owner, id, 'summary']); return; }
      if (key === 'summary') collect(item.value, id, store, rows);
      item.continue();
    };
    tx.oncomplete = () => resolve(rows);
    tx.onabort = () => reject(tx.error ?? new Error('상체 요약을 읽지 못했습니다.'));
  });
}

export const clearBrowserPostureTimelines = (owner: string) =>
  writeRows(store => { store.delete(IDBKeyRange.bound([owner], [owner, []], false, true)); });
