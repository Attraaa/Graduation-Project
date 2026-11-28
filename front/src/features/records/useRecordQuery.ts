import { useEffect, useState, useSyncExternalStore } from 'react';
import { recordsRevision, subscribeRecordsChanged } from './refresh';

export type RecordQueryLoader<T> = (context: { signal: AbortSignal; publish: (data: T) => void }) => Promise<T>;

interface QueryResult<T> {
  requestKey: string;
  base: string;
  source: string;
  saved: number;
  data: T | null;
  error: string | null;
  loading: boolean;
}

const publishedData = <T,>(result: QueryResult<T> | null, source: string, saved: number) =>
  result?.source === source && result.saved === saved && (result.loading || result.error) ? result.data : null;

/**
 * Loads one record source, again on retry and after a finished measurement has been saved (refresh.ts).
 * That refresh keeps the previous answer on screen until the new one arrives, so open pages do not flash.
 * Loaders that publish pages keep those pages available if a later page fails or is retried.
 */
export function useRecordQuery<T>(key: string, load: RecordQueryLoader<T>) {
  const [revision, setRevision] = useState(0);
  const saved = useSyncExternalStore(subscribeRecordsChanged, recordsRevision, recordsRevision);
  const base = key + ':' + revision;
  const requestKey = base + ':' + saved;
  const [result, setResult] = useState<QueryResult<T> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const request = { requestKey, base, source: key, saved };
    let latestPage: { data: T } | undefined;
    const publish = (data: T) => {
      if (signal.aborted) return;
      latestPage = { data };
      setResult(previous => previous?.base === base && !previous.loading && !previous.error
        ? previous : { ...request, data, error: null, loading: true });
    };
    void Promise.resolve().then(() => load({ signal, publish })).then(data => {
      if (!signal.aborted) setResult({ ...request, data, error: null, loading: false });
    }).catch(error => {
      if (signal.aborted) return;
      const available = latestPage;
      setResult(previous => ({ ...request, data: available ? available.data : publishedData(previous, key, saved),
        error: error instanceof Error ? error.message : '기록을 불러오지 못했습니다.', loading: false }));
    });
    return () => controller.abort();
  }, [requestKey, base, key, saved, load]);
  const current = result?.requestKey === requestKey || (result?.base === base && !result.loading && !result.error) ? result : null;
  return { data: current?.data ?? publishedData(result, key, saved), error: current?.error ?? null,
    loading: !current || current.loading, retry: () => setRevision(value => value + 1) };
}
