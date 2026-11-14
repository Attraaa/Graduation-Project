type Store = Pick<Storage, 'getItem'>;
export const NOTIFICATION_SETTINGS_CHANGED = 'moti-notification-settings-changed';
export const NOTIFICATION_SETTING_KEYS = ['notifications', 'alertFrequency', 'alertStrength', 'scoreThreshold'];
export interface NotificationPreferences {
  enabled: boolean;
  intervalMinutes: 0 | 5 | 10 | 30;
  silent: boolean;
  scoreThreshold: number;
}

export function readNotificationPreferences(store: Store = localStorage): NotificationPreferences {
  const read = (key: string) => { try { return store.getItem(`postureAI.${key}`); } catch { return null; } };
  const interval = Number(read('alertFrequency') ?? 10);
  const rawThreshold = read('scoreThreshold');
  const threshold = rawThreshold?.trim() ? Number(rawThreshold) : 70;
  return {
    enabled: read('notifications') !== 'off',
    intervalMinutes: interval === 0 || interval === 5 || interval === 30 ? interval : 10,
    silent: read('alertStrength') === 'soft',
    scoreThreshold: Number.isFinite(threshold) ? Math.max(40, Math.min(95, threshold)) : 70,
  };
}
