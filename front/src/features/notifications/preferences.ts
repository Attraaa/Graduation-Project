import { ALERT_SCORE, ALERT_SECONDS } from './activityPolicy.ts';

type Store = Pick<Storage, 'getItem'>;
export const NOTIFICATION_SETTINGS_CHANGED = 'moti-notification-settings-changed';
export const NOTIFICATION_SETTING_KEYS = ['notifications', 'alertStrength', 'scoreThreshold', 'alertSeconds', 'keyboardThreshold', 'keyboardAlertSeconds'];
export interface NotificationPreferences {
  enabled: boolean;
  silent: boolean;
  /** Upper body: a neck or balance score at or below this for `postureSeconds` of observed time alerts. */
  scoreThreshold: number;
  postureSeconds: number;
  /** Keyboard: the average of the last 50 judged presses at or below this for `keyboardSeconds` alerts. */
  keyboardThreshold: number;
  keyboardSeconds: number;
}

const bounded = (raw: string | null, range: { min: number; max: number; default: number }) => {
  const value = raw?.trim() ? Number(raw) : NaN;
  return Number.isFinite(value) ? Math.max(range.min, Math.min(range.max, Math.round(value))) : range.default;
};

export function readNotificationPreferences(store: Store = localStorage): NotificationPreferences {
  const read = (key: string) => { try { return store.getItem(`postureAI.${key}`); } catch { return null; } };
  return {
    enabled: read('notifications') !== 'off',
    silent: read('alertStrength') === 'soft',
    scoreThreshold: bounded(read('scoreThreshold'), ALERT_SCORE),
    postureSeconds: bounded(read('alertSeconds'), ALERT_SECONDS),
    keyboardThreshold: bounded(read('keyboardThreshold'), ALERT_SCORE),
    keyboardSeconds: bounded(read('keyboardAlertSeconds'), ALERT_SECONDS),
  };
}
