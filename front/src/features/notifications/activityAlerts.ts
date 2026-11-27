import type { EyeUpdate } from '../eye/EyeMonitor';
import { LIVE_SCORE_WINDOW, liveAverage, livePressScore } from '../keyboard/liveScore.ts';
import type { KeyboardMonitorSnapshot } from '../keyboard/monitorTypes';
import type { SystemNotificationRequest } from './contract';
import type { NotificationPreferences } from './preferences';
import { ALERT_COOLDOWN_MS } from './activityPolicy.ts';

export type ActivityNotificationRequest = Extract<SystemNotificationRequest, { kind: 'keyboard' | 'blink' }>;
const FRESH_OBSERVATION_MS = 2000;

/** Each channel owns its episode/cooldown. Only delivery of a current proposal consumes it. */
function createEpisode() {
  let active = false, notified = false, generation = 0, lastShownAt: number | null = null;
  const proposals = new WeakMap<ActivityNotificationRequest, number>();
  const interrupt = () => { active = false; notified = false; generation++; };
  const isCurrent = (request: ActivityNotificationRequest) => active && proposals.get(request) === generation;
  return {
    interrupt,
    reset() { interrupt(); lastShownAt = null; },
    version: () => generation,
    isCurrent,
    setActive(next: boolean) { if (active !== next) { generation++; notified = false; } active = next; },
    acknowledge(request: ActivityNotificationRequest, now: number) {
      if (!isCurrent(request)) return false;
      lastShownAt = now; notified = true; return true;
    },
    propose(request: ActivityNotificationRequest, settings: NotificationPreferences, now: number) {
      if (!active || !settings.enabled || notified) return null;
      if (lastShownAt !== null && now - lastShownAt < ALERT_COOLDOWN_MS) return null;
      proposals.set(request, generation); return request;
    },
  };
}

/**
 * The keyboard score the home card shows (average of the last 50 judged presses) at or below the alert score
 * for the chosen seconds alerts, once 50 presses were judged and while typing goes on.
 */
export function createKeyboardAlerts() {
  const episode = createEpisode();
  let average: number | null = null, lastId = -1, seenAt: number | null = null, belowSince: number | null = null;
  const interrupt = () => { average = null; seenAt = null; belowSince = null; episode.interrupt(); };
  return {
    ...episode,
    interrupt,
    reset() { interrupt(); lastId = -1; episode.reset(); },
    observe(snapshot: KeyboardMonitorSnapshot, now: number) {
      const press = snapshot.latest;
      if (snapshot.phase !== 'ready' || snapshot.observationStatus !== 'observing') {
        // A retained result from before pause/exclusion must not become a new input on resume.
        if (press) lastId = Math.max(lastId, press.id);
        interrupt(); return;
      }
      if (!press || !Number.isSafeInteger(press.id) || press.id <= lastId) return;
      lastId = press.id;
      if (livePressScore(press) === null) return;
      average = snapshot.scores.length >= LIVE_SCORE_WINDOW ? liveAverage(snapshot.scores) : null;
      seenAt = now;
    },
    sample(settings: NotificationPreferences, now: number): ActivityNotificationRequest | null {
      if (!settings.enabled) { interrupt(); return null; }
      const below = average !== null && seenAt !== null && average <= settings.keyboardThreshold;
      belowSince = below ? belowSince ?? seenAt : null;
      episode.setActive(below);
      if (!below || belowSince === null || now - seenAt! > FRESH_OBSERVATION_MS || now - belowSince < settings.keyboardSeconds * 1000) return null;
      return episode.propose({ kind: 'keyboard', silent: settings.silent, score: average! }, settings, now);
    },
  };
}

export function createBlinkAlerts() {
  const episode = createEpisode();
  let seenAt: number | null = null;
  const interrupt = () => { seenAt = null; episode.interrupt(); };
  return {
    ...episode,
    interrupt,
    reset() { interrupt(); episode.reset(); },
    observe(update: EyeUpdate, now: number) {
      if (seenAt !== null && now - seenAt > FRESH_OBSERVATION_MS) interrupt();
      seenAt = now;
      // The measurement engine already excludes calibration, blinks, gaps and invalid frames.
      episode.setActive(update.phase === 'observing' && update.measurement.calibrated && update.measurement.openReminder);
    },
    sample(settings: NotificationPreferences, now: number): ActivityNotificationRequest | null {
      if (!settings.enabled || (seenAt !== null && now - seenAt > FRESH_OBSERVATION_MS)) { interrupt(); return null; }
      if (seenAt === null) return null;
      return episode.propose({ kind: 'blink', silent: settings.silent }, settings, now);
    },
  };
}
