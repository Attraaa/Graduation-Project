import { ADVICE, ZONE } from './screenSettings.ts';
import type { HeadPose } from './headPose.ts';
import type { ScreenLayout } from './layout.ts';

/** Zone id for a face pointing away from every registered monitor. */
export const AWAY = 'away';
export type ScreenTracker = {
  current: string | null;
  currentSince: number | null;
  pending: { zone: string; since: number; ms: number } | null;
  lastAt: number | null;
  lastScreen: string | null;
  msByZone: Record<string, number>;
  observedMs: number;
  switches: number;
  longestSideStreakMs: number;
};
export type ScreenAdvice = { kind: 'side-heavy' | 'long-side' | 'front-centered'; sideShare: number; longestSideStreakMs: number };
export type ScreenShare = { id: string; label: string; main: boolean; ms: number; share: number };
export type ScreenSummary = {
  current: { id: string; label: string; main: boolean } | typeof AWAY | null;
  currentMs: number;
  shares: ScreenShare[];
  observedMs: number;
  switches: number;
  longestSideStreakMs: number;
  advice: ScreenAdvice | null;
};

export function createScreenTracker(): ScreenTracker {
  return { current: null, currentSince: null, pending: null, lastAt: null, lastScreen: null, msByZone: {}, observedMs: 0, switches: 0, longestSideStreakMs: 0 };
}

/** Ends continuity (pause, stop, long face loss). An unconfirmed glance stays with the current zone. */
export function interruptScreenTracker(state: ScreenTracker): ScreenTracker {
  const msByZone = { ...state.msByZone };
  let observedMs = state.observedMs;
  if (state.current !== null && state.pending) {
    msByZone[state.current] = (msByZone[state.current] ?? 0) + state.pending.ms;
    observedMs += state.pending.ms;
  }
  return { ...state, msByZone, observedMs, current: null, currentSince: null, pending: null, lastAt: null };
}

/** Nearest registered direction, keeping the current monitor unless another one is clearly closer. */
export function classifyScreen(layout: ScreenLayout, pose: HeadPose, current: string | null): string {
  const ranked = layout.screens
    .map(screen => ({ id: screen.id, distance: Math.hypot(pose.yaw - screen.yaw, pose.pitch - screen.pitch) }))
    .sort((a, b) => a.distance - b.distance);
  const nearest = ranked[0];
  if (!nearest || nearest.distance > ZONE.awayDegrees) return AWAY;
  const held = ranked.find(item => item.id === current);
  if (held && held.id !== nearest.id && held.distance <= ZONE.awayDegrees && held.distance - nearest.distance < ZONE.switchMarginDegrees) return held.id;
  return nearest.id;
}

const isSide = (layout: ScreenLayout, zone: string | null) => layout.screens.some(screen => screen.id === zone && !screen.main);

/**
 * Accumulates time per monitor from head-direction samples. Gaps longer than ZONE.maxGapMs and missing
 * faces are never counted, and a switch is confirmed only after ZONE.switchDwellMs.
 */
export function advanceScreenTracker(state: ScreenTracker, layout: ScreenLayout, at: number, pose: HeadPose | null): ScreenTracker {
  if (!Number.isFinite(at) || (state.lastAt !== null && at <= state.lastAt)) return state;
  const expired = state.current !== null && state.lastAt !== null && at - state.lastAt > ZONE.maxGapMs;
  if (!pose) return expired ? interruptScreenTracker(state) : state;
  const base = expired ? interruptScreenTracker(state) : state;
  const msByZone = { ...base.msByZone };
  let observedMs = base.observedMs;
  const add = (zone: string, ms: number) => { if (ms > 0) { msByZone[zone] = (msByZone[zone] ?? 0) + ms; observedMs += ms; } };
  const enter = (next: ScreenTracker, zone: string, since: number): ScreenTracker => {
    const screen = zone !== AWAY;
    const switched = screen && next.lastScreen !== null && next.lastScreen !== zone;
    return { ...next, current: zone, currentSince: since, pending: null,
      switches: next.switches + (switched ? 1 : 0), lastScreen: screen ? zone : next.lastScreen };
  };
  let next: ScreenTracker;
  if (base.current === null || base.lastAt === null) {
    next = enter(base, classifyScreen(layout, pose, null), at);
  } else {
    const dt = at - base.lastAt;
    const zone = classifyScreen(layout, pose, base.current);
    if (zone === base.current) {
      add(base.current, dt + (base.pending?.ms ?? 0));
      next = { ...base, pending: null };
    } else {
      const same = base.pending?.zone === zone;
      if (base.pending && !same) add(base.current, base.pending.ms);
      const pending = same && base.pending ? { ...base.pending, ms: base.pending.ms + dt } : { zone, since: base.lastAt, ms: dt };
      if (pending.ms >= ZONE.switchDwellMs) {
        add(zone, pending.ms);
        next = enter(base, zone, pending.since);
      } else {
        next = { ...base, pending };
      }
    }
  }
  const streak = isSide(layout, next.current) && next.currentSince !== null ? at - next.currentSince : 0;
  return { ...next, msByZone, observedMs, lastAt: at, longestSideStreakMs: Math.max(next.longestSideStreakMs, streak) };
}

export function screenAdvice(observedMs: number, sideMs: number, longestSideStreakMs: number): ScreenAdvice | null {
  if (!(observedMs >= ADVICE.minObservedMs)) return null;
  const sideShare = sideMs / observedMs;
  const kind = sideShare >= ADVICE.sideShare ? 'side-heavy' : longestSideStreakMs >= ADVICE.longSideStreakMs ? 'long-side' : 'front-centered';
  return { kind, sideShare, longestSideStreakMs };
}

/** View contract for the panel. A zone older than ZONE.maxGapMs is shown as unknown, not as still watched. */
export function summarizeScreens(state: ScreenTracker, layout: ScreenLayout, now: number): ScreenSummary {
  const fresh = state.current !== null && state.lastAt !== null && now - state.lastAt <= ZONE.maxGapMs;
  const zone = fresh ? state.current : null;
  const screen = layout.screens.find(item => item.id === zone);
  const away = state.msByZone[AWAY] ?? 0;
  const shares = [...layout.screens.map(item => ({ id: item.id, label: item.label, main: item.main, ms: state.msByZone[item.id] ?? 0 })),
    ...(away > 0 ? [{ id: AWAY, label: '화면 밖', main: false, ms: away }] : [])]
    .map(item => ({ ...item, share: state.observedMs > 0 ? item.ms / state.observedMs : 0 }));
  const sideMs = layout.screens.filter(item => !item.main).reduce((sum, item) => sum + (state.msByZone[item.id] ?? 0), 0);
  return {
    current: zone === AWAY ? AWAY : screen ? { id: screen.id, label: screen.label, main: screen.main } : null,
    currentMs: zone !== null && state.currentSince !== null && state.lastAt !== null ? state.lastAt - state.currentSince : 0,
    shares,
    observedMs: state.observedMs,
    switches: state.switches,
    longestSideStreakMs: state.longestSideStreakMs,
    advice: screenAdvice(state.observedMs, sideMs, state.longestSideStreakMs),
  };
}
