import { useCallback, useEffect, useRef, useState } from 'react';
import type { HeadPose } from './headPose';
import {
  advanceRegistration, clearLayout, displayKey, expireRegistration, finishRegistration, layoutIssue, readLayout, registrationTargets,
  startRegistration, writeLayout, type DisplayInfo, type LayoutIssue, type RegistrationState, type ScreenLayout,
} from './layout';
import { advanceScreenTracker, createScreenTracker, interruptScreenTracker, summarizeScreens, type ScreenSummary } from './tracker';

export type RegistrationView = Pick<RegistrationState, 'step' | 'progress' | 'issue' | 'status'> & { total: number; manual: boolean };
export type DualMonitorView = {
  layout: ScreenLayout | null;
  issue: LayoutIssue;
  /** Connected monitors reported by the desktop app; null in a plain browser. */
  displayCount: number | null;
  registration: RegistrationView | null;
  summary: ScreenSummary | null;
  register: () => void;
  cancelRegistration: () => void;
  forget: () => void;
  onHeadPose: (at: number, pose: HeadPose | null, cameraKey: string) => void;
};

const PUBLISH_MS = 250;
const desktop = () => window.motiDisplays;
/** Shows the target on the monitor being registered, or hides it. Failures fall back to the in-app guide. */
const syncTarget = (state: RegistrationState | null) => {
  const api = desktop();
  if (!api) return;
  const displayId = state?.status === 'collecting' ? state.targets[state.step]?.displayId : null;
  void (displayId ? api.showTarget(displayId) : api.hideTarget()).catch(() => {});
};
const registrationView = (state: RegistrationState | null): RegistrationView | null => state && {
  step: state.step, total: state.targets.length, progress: state.progress, issue: state.issue, status: state.status,
  manual: state.targets[0]?.displayId === null,
};

/**
 * Owns the per-device monitor layout and the per-run screen time. Frames arrive through `onHeadPose`
 * (stable identity, refs only); the view is published at most every PUBLISH_MS while the run is active.
 */
export function useDualMonitor({ active, run }: { active: boolean; run: number }): DualMonitorView {
  const [layout, setLayout] = useState<ScreenLayout | null>(() => readLayout());
  // undefined while the desktop app answers; null outside the desktop app.
  const [displays, setDisplays] = useState<DisplayInfo[] | null | undefined>(() => desktop() ? undefined : null);
  const [view, setView] = useState<{ registration: RegistrationView | null; summary: ScreenSummary | null; cameraKey: string | null }>(
    { registration: null, summary: null, cameraKey: null });
  const layoutRef = useRef(layout);
  const displaysRef = useRef(displays);
  const activeRef = useRef(false);
  const cameraKey = useRef<string | null>(null);
  const tracker = useRef(createScreenTracker());
  const registration = useRef<RegistrationState | null>(null);

  const publish = useCallback(() => {
    const current = layoutRef.current;
    setView({
      registration: registrationView(registration.current),
      summary: current ? summarizeScreens(tracker.current, current, performance.now()) : null,
      cameraKey: cameraKey.current,
    });
  }, []);
  const applyLayout = useCallback((next: ScreenLayout | null) => {
    layoutRef.current = next;
    tracker.current = createScreenTracker();
    setLayout(next);
  }, []);
  const setRegistration = useCallback((next: RegistrationState | null) => {
    registration.current = next;
    syncTarget(next);
    publish();
  }, [publish]);

  const onHeadPose = useCallback((at: number, pose: HeadPose | null, key: string) => {
    cameraKey.current = key;
    const state = registration.current;
    if (state?.status === 'collecting') {
      const next = advanceRegistration(state, at, pose);
      if (next === state) return;
      registration.current = next;
      if (next.status === 'done') {
        const finished = finishRegistration(next, key, displaysRef.current ?? null);
        if (finished) { writeLayout(finished); applyLayout(finished); }
        setRegistration(null);
      } else if (next.step !== state.step || next.status !== state.status) {
        setRegistration(next);
      }
      return;
    }
    const current = layoutRef.current;
    if (!current || !activeRef.current || layoutIssue(current, key, displaysRef.current) !== null) return;
    tracker.current = advanceScreenTracker(tracker.current, current, at, pose);
  }, [applyLayout, setRegistration]);

  const register = useCallback(() => {
    if (activeRef.current) setRegistration(startRegistration(registrationTargets(displaysRef.current ?? null), performance.now()));
  }, [setRegistration]);
  const cancelRegistration = useCallback(() => setRegistration(null), [setRegistration]);
  const forget = useCallback(() => { clearLayout(); applyLayout(null); publish(); }, [applyLayout, publish]);

  useEffect(() => {
    const api = desktop();
    if (!api) return;
    let alive = true;
    const apply = (list: DisplayInfo[] | null) => {
      if (!alive) return;
      // Targets were built from the old arrangement; a half-finished registration would mix them.
      if (registration.current && displaysRef.current !== undefined && displayKey(list) !== displayKey(displaysRef.current)) setRegistration(null);
      displaysRef.current = list;
      setDisplays(list);
    };
    const refresh = () => void api.list().then(apply).catch(() => apply(null));
    refresh();
    const stop = api.onChanged(refresh);
    return () => { alive = false; stop(); };
  }, [setRegistration]);

  useEffect(() => { tracker.current = createScreenTracker(); }, [run]);

  useEffect(() => {
    if (!active) return;
    activeRef.current = true;
    const timer = window.setInterval(() => {
      const state = registration.current;
      const expired = state && expireRegistration(state, performance.now());
      if (expired && expired !== state) setRegistration(expired);
      else publish();
    }, PUBLISH_MS);
    return () => {
      window.clearInterval(timer);
      activeRef.current = false;
      tracker.current = interruptScreenTracker(tracker.current);
      if (registration.current) setRegistration(null);
      else publish();
    };
  }, [active, publish, setRegistration]);

  return {
    layout,
    issue: layout ? layoutIssue(layout, view.cameraKey, displays) : null,
    displayCount: displays ? displays.length : null,
    registration: view.registration,
    summary: view.summary,
    register, cancelRegistration, forget, onHeadPose,
  };
}
