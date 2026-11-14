import { useEffect, useState } from 'react';
import { NOTIFICATION_SETTINGS_CHANGED, readNotificationPreferences } from './preferences';

export function useNotificationEnvironment() {
  const [settings, setSettings] = useState(readNotificationPreferences);
  const [allowed, setAllowed] = useState(() => !window.motiNotifications?.presentation);
  useEffect(() => {
    const refresh = () => {
      const next = readNotificationPreferences(); setSettings(next);
      void window.motiNotifications?.configure?.(next.enabled).catch(() => {});
    };
    refresh();
    const native = window.motiNotifications;
    let alive = true;
    const receive = (value: { automaticAllowed: boolean }) => { if (alive) setAllowed(value.automaticAllowed); };
    const off = native?.onPresentation?.(receive);
    void native?.presentation?.().then(receive).catch(() => {});
    window.addEventListener(NOTIFICATION_SETTINGS_CHANGED, refresh); window.addEventListener('storage', refresh);
    return () => { alive = false; off?.(); window.removeEventListener(NOTIFICATION_SETTINGS_CHANGED, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  return { settings, allowed };
}
