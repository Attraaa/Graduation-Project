import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMonitoring } from '../session/monitoringContext';
import MeasurementEndedDialog from '../session/MeasurementEndedDialog';
import { measurementSummary, type MeasurementSummary } from '../session/measurementSummary';
import { otherMode, statisticsTarget, type MonitoringMode } from '../session/modes';
import { commandAllowed } from './contract';
import { overlaySnapshot } from './snapshot';
import { recordingFailedForCurrentOwner } from '../records/recording';
import { readNotificationPreferences } from '../notifications/preferences';

/**
 * Publishes the overlay's view of both modes and runs its commands. A stop from the overlay ends with the same
 * result dialog as the home card, here in the main window: Electron main closes the overlay and restores this window.
 */
export default function MonitoringDesktopBridge() {
  const all = useMonitoring();
  const navigate = useNavigate();
  const [owner] = useState(() => crypto.randomUUID());
  const [ended, setEnded] = useState<{ mode: MonitoringMode; summary: MeasurementSummary } | null>(null);
  const current = useRef(all), sequence = useRef(0);
  useLayoutEffect(() => { current.current = all; });
  const publish = useCallback(() => {
    // The alert scores are read each time, so a change in the settings shows on the next update.
    const settings = readNotificationPreferences();
    window.motiDesktop?.publish(overlaySnapshot(current.current, owner, ++sequence.current, document.documentElement.classList.contains('dark-theme') ? 'dark' : 'light',
      recordingFailedForCurrentOwner(), { posture: settings.scoreThreshold, keyboard: settings.keyboardThreshold }));
  }, [owner]);
  useEffect(() => {
    const bridge = window.motiDesktop;
    if (!bridge) return;
    const off = bridge.onCommand(command => {
      const session = command.mode === 'upper_body' ? current.current.upper : current.current.keyboard;
      const state = session.controls.getState();
      if (command.owner !== owner || command.run !== state.run || !commandAllowed(state, command.action)) return { ok: false };
      if (command.action === 'stop') setEnded({ mode: command.mode, summary: measurementSummary(current.current, command.mode, session.controls.stop()) });
      else if (command.action === 'start') session.start(); else session.controls[command.action]();
      return { ok: true };
    });
    publish();
    const timer = window.setInterval(publish, 1000);
    const theme = new MutationObserver(publish); theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => { off(); window.clearInterval(timer); theme.disconnect(); bridge.publish(null); };
  }, [owner, publish]);
  const critical = [all.upper.controls.isRunning, all.upper.controls.isPaused, all.upper.controls.run, all.upper.snapshot.phase, all.upper.eye.phase,
    all.keyboard.controls.isRunning, all.keyboard.controls.isPaused, all.keyboard.controls.run, all.keyboard.snapshot.phase].join(':');
  useEffect(() => { publish(); }, [critical, publish]);
  if (!ended) return null;
  const remaining = ended.mode === 'upper_body' ? all.keyboard.controls : all.upper.controls;
  return <MeasurementEndedDialog mode={ended.mode} summary={ended.summary}
    remaining={remaining.isRunning ? { mode: otherMode(ended.mode), paused: remaining.isPaused } : null}
    onClose={() => setEnded(null)}
    onStatistics={() => { setEnded(null); navigate(statisticsTarget(ended.mode), { state: { focusStatisticsTab: true } }); }} />;
}
