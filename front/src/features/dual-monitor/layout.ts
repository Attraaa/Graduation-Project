import { REGISTRATION } from './screenSettings.ts';
import type { HeadPose } from './headPose.ts';

export type Bounds = { x: number; y: number; width: number; height: number };
/** A monitor reported by the desktop app. Coordinates follow the OS display arrangement. */
export type DisplayInfo = { id: string; label: string; bounds: Bounds; primary: boolean; app: boolean };
/** Head direction registered for one monitor. `main` is the monitor the camera faces. */
export type ScreenDirection = { id: string; label: string; yaw: number; pitch: number; main: boolean };
export type ScreenLayout = { version: 1; cameraKey: string; displayKey: string | null; screens: ScreenDirection[] };
export type LayoutIssue = 'camera' | 'displays' | null;
export type RegistrationTarget = { id: string; displayId: string | null };
export type RegistrationIssue = 'no-face' | 'unstable' | 'too-close' | 'timeout';
type Sample = HeadPose & { at: number };
export type RegistrationState = {
  targets: RegistrationTarget[];
  step: number;
  stepStartedAt: number;
  lastValidAt: number | null;
  samples: Sample[];
  captured: (HeadPose & { id: string })[];
  progress: number;
  issue: RegistrationIssue | null;
  status: 'collecting' | 'done' | 'failed';
};

export const MAX_SCREENS = 4;
const LAYOUT_KEY = 'moti.dual-monitor.layout';
const SIDE_LABEL = { left: '왼쪽', right: '오른쪽', above: '위쪽', below: '아래쪽' } as const;

const distance = (a: HeadPose, b: HeadPose) => Math.hypot(a.yaw - b.yaw, a.pitch - b.pitch);
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const spread = (samples: Sample[], key: keyof HeadPose) => {
  const values = samples.map(sample => sample[key]);
  return Math.max(...values) - Math.min(...values);
};

/** One target per connected monitor, starting with the one showing Moti; otherwise front and side by hand. */
export function registrationTargets(displays: DisplayInfo[] | null): RegistrationTarget[] {
  if (!displays || displays.length < 2) return [{ id: 'front', displayId: null }, { id: 'side', displayId: null }];
  return [...displays]
    .sort((a, b) => Number(b.app) - Number(a.app) || a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    .slice(0, MAX_SCREENS)
    .map(display => ({ id: `display:${display.id}`, displayId: display.id }));
}

/** Changes when a monitor is added, removed or rearranged, so stale directions are never reused. */
export function displayKey(displays: DisplayInfo[] | null): string | null {
  if (!displays || displays.length < 2) return null;
  return displays.map(({ id, bounds: b }) => `${id}@${b.x},${b.y},${b.width}x${b.height}`).sort().join('|');
}

/** Where `other` sits relative to `main` in the OS display arrangement. */
export function sideOf(main: Bounds, other: Bounds): keyof typeof SIDE_LABEL {
  const dx = other.x + other.width / 2 - (main.x + main.width / 2);
  const dy = other.y + other.height / 2 - (main.y + main.height / 2);
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'above' : 'below');
}

export function startRegistration(targets: RegistrationTarget[], at: number): RegistrationState {
  return { targets, step: 0, stepStartedAt: at, lastValidAt: null, samples: [], captured: [], progress: 0, issue: null, status: 'collecting' };
}

/** Ends a step that could not be registered in time, even when no face samples arrive at all. */
export function expireRegistration(state: RegistrationState, at: number): RegistrationState {
  if (state.status !== 'collecting' || !(at - state.stepStartedAt > REGISTRATION.timeoutMs)) return state;
  return { ...state, status: 'failed', samples: [], progress: 0, issue: state.issue ?? 'timeout' };
}

/**
 * Collects a steady head direction for the current target. Samples taken while the head still points
 * at an already registered monitor are ignored, so looking late at the new target cannot register it twice.
 */
export function advanceRegistration(state: RegistrationState, at: number, pose: HeadPose | null): RegistrationState {
  if (state.status !== 'collecting' || !Number.isFinite(at)) return state;
  const expired = expireRegistration(state, at);
  if (expired !== state) return expired;
  if (at - state.stepStartedAt < REGISTRATION.leadInMs) return state;
  const gap = state.lastValidAt === null || at - state.lastValidAt > REGISTRATION.maxGapMs;
  if (!pose) return gap && state.issue !== 'no-face' ? { ...state, samples: [], progress: 0, issue: 'no-face' } : state;
  const last = state.samples.at(-1);
  if (last && at <= last.at) return state;
  if (state.captured.some(item => distance(item, pose) < REGISTRATION.minSeparationDegrees)) {
    return { ...state, samples: [], lastValidAt: at, progress: 0, issue: 'too-close' };
  }
  let samples = gap ? [{ at, ...pose }] : [...state.samples, { at, ...pose }];
  let issue = samples.length >= 2 ? null : state.issue;
  if (spread(samples, 'yaw') > REGISTRATION.maxSpreadDegrees || spread(samples, 'pitch') > REGISTRATION.maxSpreadDegrees) {
    samples = [{ at, ...pose }];
    issue = 'unstable';
  }
  const duration = at - samples[0].at;
  if (duration < REGISTRATION.collectMs || samples.length < REGISTRATION.minSamples) {
    return { ...state, samples, lastValidAt: at, progress: Math.min(1, duration / REGISTRATION.collectMs), issue };
  }
  const direction = { yaw: median(samples.map(sample => sample.yaw)), pitch: median(samples.map(sample => sample.pitch)) };
  const captured = [...state.captured, { id: state.targets[state.step].id, ...direction }];
  const step = state.step + 1;
  return { ...state, step, captured, stepStartedAt: at, lastValidAt: null, samples: [], progress: 0, issue: null,
    status: step >= state.targets.length ? 'done' : 'collecting' };
}

/**
 * The direction closest to facing the camera becomes the main ("front") monitor. Other monitors are
 * named by their place in the OS arrangement when the desktop app reported it.
 */
export function finishRegistration(state: RegistrationState, cameraKey: string, displays: DisplayInfo[] | null): ScreenLayout | null {
  if (state.status !== 'done' || state.captured.length < 2) return null;
  const main = state.captured.reduce((best, item) => Math.hypot(item.yaw, item.pitch) < Math.hypot(best.yaw, best.pitch) ? item : best);
  const boundsOf = (id: string) => displays?.find(display => `display:${display.id}` === id)?.bounds ?? null;
  const mainBounds = boundsOf(main.id);
  const names = state.captured.map(item => {
    const bounds = boundsOf(item.id);
    return item === main ? '정면' : mainBounds && bounds ? SIDE_LABEL[sideOf(mainBounds, bounds)] : '보조';
  });
  const screens = state.captured.map((item, index) => {
    const same = names.filter(name => name === names[index]).length > 1;
    const order = names.slice(0, index + 1).filter(name => name === names[index]).length;
    return { id: item.id, label: `${names[index]} 모니터${same ? ` ${order}` : ''}`, yaw: item.yaw, pitch: item.pitch, main: item === main };
  });
  return { version: 1, cameraKey, displayKey: displayKey(displays), screens };
}

/** Registered directions are valid only for the same camera image and the same monitor arrangement. */
export function layoutIssue(layout: ScreenLayout, cameraKey: string | null, displays: DisplayInfo[] | null | undefined): LayoutIssue {
  if (cameraKey !== null && layout.cameraKey !== cameraKey) return 'camera';
  if (displays !== undefined && displayKey(displays) !== layout.displayKey) return 'displays';
  return null;
}

export function parseLayout(text: string | null): ScreenLayout | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text);
    if (value?.version !== 1 || typeof value.cameraKey !== 'string' || !(value.displayKey === null || typeof value.displayKey === 'string')
      || !Array.isArray(value.screens) || value.screens.length < 2 || value.screens.length > MAX_SCREENS) return null;
    const screens: ScreenDirection[] = value.screens.map((item: Partial<ScreenDirection> | null) => ({
      id: item?.id, label: item?.label, yaw: item?.yaw, pitch: item?.pitch, main: item?.main,
    }));
    if (!screens.every(item => typeof item.id === 'string' && typeof item.label === 'string' && Number.isFinite(item.yaw)
      && Number.isFinite(item.pitch) && typeof item.main === 'boolean')) return null;
    if (screens.filter(item => item.main).length !== 1 || new Set(screens.map(item => item.id)).size !== screens.length) return null;
    return { version: 1, cameraKey: value.cameraKey, displayKey: value.displayKey, screens };
  } catch {
    return null;
  }
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function readLayout(store: Store = localStorage) {
  try { return parseLayout(store.getItem(LAYOUT_KEY)); } catch { return null; }
}
export function writeLayout(layout: ScreenLayout, store: Store = localStorage) {
  try { store.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* The layout still applies until the app closes. */ }
}
export function clearLayout(store: Store = localStorage) {
  try { store.removeItem(LAYOUT_KEY); } catch { /* Nothing was persisted. */ }
}
