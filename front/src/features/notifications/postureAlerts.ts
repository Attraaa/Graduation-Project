import type { MonitorSnapshot } from '../posture/monitorTypes.ts';
import type { NotificationPreferences } from './preferences.ts';
import type { PostureAlertPart, SystemNotificationRequest } from './contract.ts';

export const LOW_SCORE_DURATION_MS = 3000;
// "발생 시" sends once per episode; even repeated recoveries cannot flood Windows.
export const MIN_ALERT_INTERVAL_MS = 10_000;

/** Alert timing is separate from scoring/habit policies and never changes stored measurements. */
export function createPostureAlerts() {
  const empty = () => ({ elapsed: 0, continuous: null as number | null });
  let low = { neck: empty(), shoulder: empty() };
  let lastAlertAt: number | null = null;
  let notifiedEpisode = false;
  let generation = 0, candidateActive = false;
  const proposals = new WeakMap<SystemNotificationRequest, number>();
  const interrupt = () => { low = { neck: empty(), shoulder: empty() }; notifiedEpisode = false; candidateActive = false; generation++; };
  return {
    interrupt,
    reset: () => { interrupt(); lastAlertAt = null; },
    version: () => generation,
    acknowledge(request: SystemNotificationRequest, now: number) {
      if (!candidateActive || proposals.get(request) !== generation) return;
      lastAlertAt = now; notifiedEpisode = true;
    },
    sample(snapshot: MonitorSnapshot, settings: NotificationPreferences, now: number): SystemNotificationRequest | null {
      if (!settings.enabled || snapshot.phase !== 'observing') { interrupt(); return null; }
      const parts: PostureAlertPart[] = [];
      let candidate = false;
      for (const part of ['neck', 'shoulder'] as const) {
        const summary = snapshot[part];
        if (summary.currentScore === null || summary.protection !== 'none') { low[part] = empty(); continue; }
        const below = summary.currentScore <= settings.scoreThreshold;
        const away = summary.deviationState === 'away';
        candidate ||= below || away;
        if (below) {
          const previous = low[part];
          const delta = previous.continuous !== null && summary.continuousMs >= previous.continuous
            ? summary.continuousMs - previous.continuous : 0;
          low[part] = {
            elapsed: previous.continuous !== null && summary.continuousMs >= previous.continuous ? previous.elapsed + delta : 0,
            continuous: summary.continuousMs,
          };
        } else low[part] = empty();
        if (away || low[part].elapsed >= LOW_SCORE_DURATION_MS) parts.push({ part, score: summary.currentScore, away });
      }
      if (!candidate) { if (candidateActive) generation++; notifiedEpisode = false; }
      candidateActive = candidate;
      if (!parts.length || (settings.intervalMinutes === 0 && notifiedEpisode)) return null;
      const interval = Math.max(MIN_ALERT_INTERVAL_MS, settings.intervalMinutes * 60_000);
      if (lastAlertAt !== null && now - lastAlertAt < interval) return null;
      const request: SystemNotificationRequest = { kind: 'posture', silent: settings.silent, parts };
      proposals.set(request, generation);
      return request;
    },
  };
}
