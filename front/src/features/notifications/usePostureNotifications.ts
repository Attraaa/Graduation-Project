import { useEffect, useLayoutEffect, useRef } from 'react';
import type { MonitorSnapshot } from '../posture/monitorTypes';
import type { SystemNotificationRequest } from './contract';
import { createPostureAlerts } from './postureAlerts';
import { useNotificationEnvironment } from './useNotificationEnvironment';
import { reportNotificationDelivery } from './delivery';

export function usePostureNotifications(snapshot: MonitorSnapshot, active: boolean, run: number, reference: number) {
  const { settings, allowed } = useNotificationEnvironment();
  const current = useRef({ snapshot, active, settings, allowed, run, reference });
  useLayoutEffect(() => { current.current = { snapshot, active, settings, allowed, run, reference }; });
  useEffect(() => {
    const alerts = createPostureAlerts();
    let previous: MonitorSnapshot | null = null, seenAt = 0, session = { run: -1, reference: -1 };
    let pending: SystemNotificationRequest | null = null, retryAt = 0, attempts = 0, version = -1, alive = true;
    const tick = () => {
      const value = current.current, now = performance.now();
      if (value.run !== session.run || value.reference !== session.reference) {
        session = { run: value.run, reference: value.reference }; alerts.reset(); previous = value.snapshot; seenAt = 0;
        pending = null; attempts = 0; retryAt = 0; void window.motiNotifications?.clear('posture'); return;
      }
      if (!value.active || !value.settings.enabled) {
        if (previous !== null) { alerts.interrupt(); pending = null; void window.motiNotifications?.clear('posture'); }
        previous = null; return;
      }
      if (previous !== value.snapshot) { previous = value.snapshot; seenAt = now; }
      if (!seenAt || now - seenAt > 2000) return;
      const proposal = alerts.sample(value.snapshot, value.settings, now);
      if (alerts.version() !== version) { version = alerts.version(); retryAt = 0; attempts = 0; }
      if (!proposal || pending || !value.allowed || now < retryAt || !window.motiNotifications) return;
      pending = proposal;
      void window.motiNotifications.show(proposal).then(result => {
        if (!alive) return;
        if (result.ok) { alerts.acknowledge(proposal, performance.now()); reportNotificationDelivery(true); attempts = 0; }
        else if (result.status !== 'suppressed') { attempts++; retryAt = attempts >= 3 ? Infinity : performance.now() + 30_000; reportNotificationDelivery(false); }
        else retryAt = performance.now() + 1000;
      }).catch(() => { attempts++; retryAt = attempts >= 3 ? Infinity : performance.now() + 30_000; reportNotificationDelivery(false); })
        .finally(() => { if (pending === proposal) pending = null; });
    };
    tick();
    const timer = window.setInterval(tick, 200);
    return () => { alive = false; alerts.reset(); window.clearInterval(timer); void window.motiNotifications?.clear('posture'); };
  }, []);
}
