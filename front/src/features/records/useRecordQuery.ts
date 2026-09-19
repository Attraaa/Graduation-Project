import { useEffect, useState } from 'react';
export function useRecordQuery<T>(key: string, load: () => Promise<T>) {
  const [revision, setRevision] = useState(0);
  const requestKey = key + ':' + revision;
  const [result, setResult] = useState<{ key: string; data: T | null; error: string | null } | null>(null);
  useEffect(() => {
    let current = true;
    void Promise.resolve().then(load).then(data => {
      if (current) setResult({ key: requestKey, data, error: null });
    }).catch(error => {
      if (current) setResult({ key: requestKey, data: null, error: error instanceof Error ? error.message : '기록을 불러오지 못했습니다.' });
    });
    return () => { current = false; };
  }, [requestKey, load]);
  const current = result?.key === requestKey ? result : null;
  return { data: current?.data ?? null, error: current?.error ?? null, loading: !current, retry: () => setRevision(value => value + 1) };
}
