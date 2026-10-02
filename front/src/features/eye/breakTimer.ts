import { eyePolicy as p } from './eyePolicy.ts';

/** User-declared breaks; absence of a face is never counted as a break. */
export function createBreakTimer(intervalMs: number = p.breakIntervalMs) {
  let lastAt: number | null = null;
  let workMs = 0;
  let restMs = 0;
  let resting = false;
  let completed = 0;
  const snapshot = () => ({ resting, completed, due: workMs >= intervalMs,
    untilBreakMs: Math.max(0, intervalMs - workMs), remainingMs: Math.max(0, p.breakDurationMs - restMs) });
  const tick = (now: number) => {
    if (!Number.isFinite(now) || (lastAt !== null && now < lastAt)) return snapshot();
    const delta = lastAt === null ? 0 : now - lastAt;
    lastAt = now;
    // Sleep / heavily throttled timers are unknown time, not confirmed work or rest.
    if (delta <= 2000) {
      if (resting) restMs += delta;
      else workMs += delta;
    }
    return snapshot();
  };
  return { tick, snapshot,
    start: (now: number) => { tick(now); resting = true; restMs = 0; return snapshot(); },
    finish: (now: number) => {
      tick(now);
      if (resting && restMs >= p.breakDurationMs) { completed += 1; workMs = 0; }
      resting = false; restMs = 0;
      return snapshot();
    },
  };
}
