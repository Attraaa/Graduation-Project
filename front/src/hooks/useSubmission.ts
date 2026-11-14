import { useCallback, useEffect, useRef, useState } from 'react';

/** Lock synchronously, including while a result dialog is awaiting acknowledgement. */
export function useSubmission() {
  const pending = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => pending.current?.abort(), []);
  const run = useCallback(async (submit: (signal: AbortSignal) => Promise<void>) => {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try { await submit(controller.signal); }
    finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }, []);
  return { busy, run };
}
