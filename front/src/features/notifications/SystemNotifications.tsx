import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { recordingFailedForCurrentOwner, subscribeRecording } from '../records/recording';
import { getCurrentUser } from '../../utils/authStore';
import { createIssueQueue, SYSTEM_ISSUE_EVENT, type IssueEvent } from './issues';
import { useNotificationEnvironment } from './useNotificationEnvironment';
import { reportNotificationDelivery } from './delivery';
import { statisticsTarget } from '../session/modes';

export default function SystemNotifications() {
  const navigate = useNavigate();
  const navigation = useRef(navigate);
  useLayoutEffect(() => { navigation.current = navigate; }, [navigate]);
  const environment = useNotificationEnvironment();
  const current = useRef(environment);
  useLayoutEffect(() => { current.current = environment; });
  const queue = useRef(createIssueQueue());
  const failed = useSyncExternalStore(subscribeRecording, recordingFailedForCurrentOwner, () => false);
  useEffect(() => {
    const issues = queue.current;
    if (!failed || !environment.settings.enabled) { issues.set({ key: 'storage', id: '', code: null }, performance.now()); return; }
    const timer = window.setTimeout(() => issues.set({ key: 'storage', id: crypto.randomUUID(), code: 'storage' }, performance.now()), 2000);
    return () => window.clearTimeout(timer);
  }, [failed, environment.settings.enabled]);
  useEffect(() => {
    const issues = queue.current;
    let pending = false, alive = true, owner = getCurrentUser()?.id, enabled = current.current.settings.enabled;
    const receive = (event: Event) => { const issue = (event as CustomEvent<IssueEvent>).detail; if (current.current.settings.enabled || !issue.code) issues.set(issue, performance.now()); };
    const tick = () => {
      const nextOwner = getCurrentUser()?.id;
      if (owner !== nextOwner) { owner = nextOwner; issues.clear(!nextOwner); void window.motiNotifications?.clear('issue'); }
      const { allowed, settings } = current.current;
      if (recordingFailedForCurrentOwner()) issues.refresh('storage', performance.now());
      if (!settings.enabled) { issues.clear(); if (enabled) void window.motiNotifications?.clear('issue'); enabled = false; return; }
      enabled = true;
      const incident = issues.next(performance.now());
      if (!incident || !allowed || pending || !window.motiNotifications) return;
      pending = true;
      void window.motiNotifications.show(issues.request(incident, settings.silent)).then(result => {
        if (!alive) return;
        issues.acknowledge(incident, result, performance.now());
        if (result.status !== 'suppressed') reportNotificationDelivery(result.ok);
      }).catch(() => { if (alive) { issues.acknowledge(incident, { ok: false }, performance.now()); reportNotificationDelivery(false); } })
        .finally(() => { pending = false; });
    };
    const off = window.motiDesktop?.onNavigate(target => {
      const card = ({ '/dashboard?mode=upper_body': '상체 모니터링', '/dashboard?mode=keyboard': '키보드 모니터링' } as Record<string, string>)[target];
      if (!card && !['/dashboard', '/login', statisticsTarget('upper_body'), statisticsTarget('keyboard')].includes(target)) return;
      navigation.current(target);
      // Mode alerts show that mode's home card; the plain home target is the storage notice.
      if (card) window.setTimeout(() => document.querySelector(`section[aria-label="${card}"]`)?.scrollIntoView({ block: 'start' }), 150);
      else if (target === '/dashboard') window.setTimeout(() => document.querySelector('[data-recording-status]')?.scrollIntoView({ block: 'center' }), 150);
    });
    const offHalt = window.motiKeyboard?.onHalt(() => { issues.clear(); });
    window.addEventListener(SYSTEM_ISSUE_EVENT, receive);
    const timer = window.setInterval(tick, 500);
    return () => { alive = false; issues.clear(); window.clearInterval(timer); window.removeEventListener(SYSTEM_ISSUE_EVENT, receive); off?.(); offHalt?.(); void window.motiNotifications?.clear('issue'); };
  }, []);
  return null;
}
