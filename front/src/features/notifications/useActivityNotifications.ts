import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EyeUpdate } from '../eye/EyeMonitor';
import type { KeyboardMonitorSnapshot } from '../keyboard/monitorTypes';
import { createBlinkAlerts, createKeyboardAlerts, type ActivityNotificationRequest } from './activityAlerts';
import { reportNotificationDelivery } from './delivery';
import { useNotificationEnvironment } from './useNotificationEnvironment';

type Session = { running: boolean; paused: boolean; run: number };
const channel = <T extends ReturnType<typeof createKeyboardAlerts> | ReturnType<typeof createBlinkAlerts>>(alerts: T) =>
  ({ alerts, run: -1, reference: -1, active: false, version: -1, pending: null as ActivityNotificationRequest | null, retryAt: 0, attempts: 0 });
type Channel = ReturnType<typeof channel>;

function sync(value: Channel, kind: 'keyboard' | 'blink', session: Session, reference: number, enabled: boolean) {
  const active = enabled && session.running && !session.paused;
  const reset = value.run !== session.run || value.reference !== reference;
  if (reset || value.active !== active) {
    if (reset) value.alerts.reset(); else value.alerts.interrupt();
    value.run = session.run; value.reference = reference; value.active = active;
  }
  if (value.version !== value.alerts.version()) {
    value.version = value.alerts.version(); value.pending = null; value.retryAt = 0; value.attempts = 0;
    void window.motiNotifications?.clear(kind);
  }
  return active;
}

/** Observe callbacks consume every input before React can batch display updates. No input text is retained. */
export function useActivityNotifications(upperState: () => Session, keyboardState: () => Session, reference: number) {
  const { settings, allowed } = useNotificationEnvironment();
  const current = useRef({ settings, allowed, upperState, keyboardState, reference });
  const [channels] = useState(() => ({ keyboard: channel(createKeyboardAlerts()), blink: channel(createBlinkAlerts()) }));
  useLayoutEffect(() => {
    current.current = { settings, allowed, upperState, keyboardState, reference };
    sync(channels.keyboard, 'keyboard', keyboardState(), 0, settings.enabled);
    sync(channels.blink, 'blink', upperState(), reference, settings.enabled);
  });
  const observeKeyboard = useCallback((snapshot: KeyboardMonitorSnapshot) => {
    const value = current.current;
    if (sync(channels.keyboard, 'keyboard', value.keyboardState(), 0, value.settings.enabled)) channels.keyboard.alerts.observe(snapshot, performance.now());
  }, [channels]);
  const observeEye = useCallback((update: EyeUpdate) => {
    const value = current.current;
    if (sync(channels.blink, 'blink', value.upperState(), value.reference, value.settings.enabled)) channels.blink.alerts.observe(update, performance.now());
  }, [channels]);
  useEffect(() => {
    let alive = true;
    const tick = () => {
      const value = current.current, now = performance.now();
      for (const kind of ['keyboard', 'blink'] as const) {
        const state = channels[kind];
        const session = kind === 'keyboard' ? value.keyboardState() : value.upperState();
        if (!sync(state, kind, session, kind === 'blink' ? value.reference : 0, value.settings.enabled)) continue;
        const proposal = state.alerts.sample(value.settings, now);
        // Observed recovery or stale eye data also invalidates pending delivery/retry state.
        sync(state, kind, session, kind === 'blink' ? value.reference : 0, value.settings.enabled);
        if (!proposal || state.pending || !value.allowed || now < state.retryAt || !window.motiNotifications) continue;
        state.pending = proposal;
        const settled = (result: { ok: boolean; status?: string }) => {
          if (!alive || state.pending !== proposal || !state.alerts.isCurrent(proposal)) return;
          if (result.ok) { state.alerts.acknowledge(proposal, performance.now()); state.attempts = 0; reportNotificationDelivery(true); }
          else if (result.status === 'suppressed') state.retryAt = performance.now() + 1000;
          else { state.attempts++; state.retryAt = state.attempts >= 3 ? Infinity : performance.now() + 30_000; reportNotificationDelivery(false); }
        };
        void window.motiNotifications.show(proposal).then(settled).catch(() => settled({ ok: false }))
          .finally(() => { if (state.pending === proposal) state.pending = null; });
      }
    };
    const timer = window.setInterval(tick, 200);
    return () => {
      alive = false; window.clearInterval(timer);
      for (const kind of ['keyboard', 'blink'] as const) { channels[kind].alerts.reset(); channels[kind].pending = null; void window.motiNotifications?.clear(kind); }
    };
  }, [channels]);
  return { observeKeyboard, observeEye };
}
