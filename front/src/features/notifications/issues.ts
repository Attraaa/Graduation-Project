import type { IssueCode, SystemNotificationRequest, SystemNotificationResult } from './contract';

export const SYSTEM_ISSUE_EVENT = 'moti-system-issue';
export interface IssueEvent { key: string; id: string; code: IssueCode | null; active?: boolean }
export function systemIssue(key: string, id: string, code: IssueCode | null, active = true) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new CustomEvent<IssueEvent>(SYSTEM_ISSUE_EVENT, { detail: { key, id, code, active } }));
}
type Incident = { key: string; id: string; code: IssueCode; at: number; sent: boolean; attempts: number; retryAt: number; active: boolean };
const priority: Record<IssueCode, number> = { auth: 0, storage: 1, 'upper-analysis': 2, 'keyboard-analysis': 2, 'eye-analysis': 3, tracking: 4 };
export function createIssueQueue() {
  const incidents = new Map<string, Incident>();
  return {
    set(event: IssueEvent, now: number) {
      if (!event.code) { incidents.delete(event.key); return; }
      const previous = incidents.get(event.key);
      if (previous?.id === event.id) { previous.active = event.active !== false; if (previous.active) previous.at = now; return; }
      incidents.set(event.key, { ...event, active: event.active !== false, code: event.code, at: now, sent: false, attempts: 0, retryAt: 0 });
    },
    refresh(key: string, now: number) { const incident = incidents.get(key); if (incident) incident.at = now; },
    clear(preserveAuth = false) { for (const [key, value] of incidents) if (!preserveAuth || value.code !== 'auth') incidents.delete(key); },
    next(now: number) {
      return [...incidents.values()].filter(v => v.active && !v.sent && v.at + 60_000 > now && v.retryAt <= now && v.attempts < 3).sort((a, b) => priority[a.code] - priority[b.code])[0] ?? null;
    },
    acknowledge(incident: Incident, result: Pick<SystemNotificationResult, 'ok' | 'status'>, now: number) {
      if (incidents.get(incident.key) !== incident) return;
      if (result.ok) incident.sent = true;
      else if (result.status === 'suppressed') incident.retryAt = now + 1000;
      else { incident.attempts++; incident.retryAt = now + 15_000; }
    },
    request: (incident: Incident, silent: boolean): SystemNotificationRequest => ({ kind: 'issue', code: incident.code, silent }),
  };
}
