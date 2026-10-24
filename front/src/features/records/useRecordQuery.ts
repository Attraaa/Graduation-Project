import { useEffect, useState, useSyncExternalStore } from 'react';
import { recordsRevision, subscribeRecordsChanged } from './refresh';

/**
 * Loads one record source, again on retry and after a finished measurement has been saved (refresh.ts).
 * That refresh keeps the previous answer on screen until the new one arrives, so open pages do not flash.
 */
export function useRecordQuery<T>(key: string, load: () => Promise<T>) {
  const [revision, setRevision] = useState(0);
  const saved = useSyncExternalStore(subscribeRecordsChanged, recordsRevision, recordsRevision);
  const base = key + ':' + revision;
  const requestKey = base + ':' + saved;
  const [result, setResult] = useState<{ key: string; base: string; data: T | null; error: string | null } | null>(null);
  useEffect(() => {
    let current = true;
    void Promise.resolve().then(load).then(data => {
      if (current) setResult({ key: requestKey, base, data, error: null });
    }).catch(error => {
      if (current) setResult({ key: requestKey, base, data: null, error: error instanceof Error ? error.message : '기록을 불러오지 못했습니다.' });
    });
    return () => { current = false; };
  }, [requestKey, base, load]);
  const current = result?.key === requestKey || (result?.base === base && !result.error) ? result : null;
  return { data: current?.data ?? null, error: current?.error ?? null, loading: !current, retry: () => setRevision(value => value + 1) };
}
