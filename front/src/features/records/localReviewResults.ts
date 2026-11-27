import type { EyeStatisticsRow } from '../../../../database/eye';
import type { KeyboardStored } from '../../../../database/keyboard';
import { registerRecorder, announceRecording } from './recording';
import { localReviewSaved } from './reviewRefresh';

type Snapshot = { kind: 'eye'; rows: EyeStatisticsRow[] } | { kind: 'keyboard'; session: KeyboardStored };
const STORE = 'completed';
let opening: Promise<IDBDatabase> | undefined;
function database() {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('moti-review-results', 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onsuccess = () => {
      const db = open.result;
      db.onversionchange = () => { db.close(); opening = undefined; };
      resolve(db);
    };
    open.onerror = () => reject(open.error);
  }).catch(error => { opening = undefined; throw error; });
  return opening;
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error ?? new Error('이 기기의 측정 요약을 열지 못했습니다.'));
  });
}

type Pending = { owner: string; write: () => Promise<unknown>; saving?: Promise<void>; error?: string };
const pending = new Set<Pending>();
function save(entry: Pending): Promise<void> {
  return entry.saving ??= entry.write().then(() => {
    pending.delete(entry);
    localReviewSaved();
  }).catch(error => {
    if (pending.has(entry)) { entry.error = '측정 요약을 이 기기에 저장하지 못했습니다.'; announceRecording(entry.error); }
    throw error;
  }).finally(() => { entry.saving = undefined; });
}
registerRecorder({
  finish: () => {},
  retry: async () => { await Promise.all([...pending].map(save)); },
  discard: owner => { for (const e of pending) if (e.owner === owner) pending.delete(e); },
  error: () => [...pending].find(e => e.error)?.error ?? null,
  failedForOwner: owner => [...pending].some(e => e.owner === owner && !!e.error),
});

export function saveLocalReviewResult(owner: string, date: string, id: string, snapshot: Snapshot) {
  const entry = { owner, write: () => transaction('readwrite', s => s.put(snapshot, [owner, date, id])) };
  pending.add(entry);
  void save(entry).catch(() => {});
}

export async function readLocalReviewResults(owner: string, from: string, to: string) {
  const range = IDBKeyRange.bound([owner, from], [owner, to, []]);
  const rows: Snapshot[] = await transaction('readonly', s => s.getAll(range));
  return { eye: rows.flatMap(row => row.kind === 'eye' ? row.rows.filter(r => r.date >= from && r.date <= to) : []),
    keyboard: rows.flatMap(row => row.kind === 'keyboard' ? [{ ...row.session,
      counts: row.session.counts.filter(r => r.date >= from && r.date <= to) }] : []) };
}

export const clearLocalReviewResults = (owner: string) =>
  transaction('readwrite', store => store.delete(IDBKeyRange.bound([owner], [owner, []], false, true)));
