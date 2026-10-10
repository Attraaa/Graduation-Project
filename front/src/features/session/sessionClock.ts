/** Active session time excludes explicit pauses; wall time is left to recorders. */
export function createSessionClock(now: () => number = () => performance.now()) {
  let accumulated = 0;
  let started: number | null = null;
  return {
    seconds: () => (accumulated + (started === null ? 0 : Math.max(0, now() - started))) / 1000,
    start: () => { accumulated = 0; started = now(); },
    pause: () => { if (started !== null) { accumulated += Math.max(0, now() - started); started = null; } },
    resume: () => { if (started === null) started = now(); },
  };
}
