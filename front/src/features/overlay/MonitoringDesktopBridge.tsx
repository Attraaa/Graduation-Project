import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMonitoring } from '../session/monitoringContext';
import { commandAllowed } from './contract';
import { overlaySnapshot } from './snapshot';
import { recordingFailedForCurrentOwner } from '../records/recording';

export default function MonitoringDesktopBridge() {
  const all = useMonitoring();
  const [owner] = useState(() => crypto.randomUUID());
  const current = useRef(all), sequence = useRef(0);
  useLayoutEffect(() => { current.current = all; });
  const publish = useCallback(() => {
    window.motiDesktop?.publish(overlaySnapshot(current.current, owner, ++sequence.current, document.documentElement.classList.contains('dark-theme') ? 'dark' : 'light', recordingFailedForCurrentOwner()));
  }, [owner]);
  useEffect(() => {
    const bridge = window.motiDesktop;
    if (!bridge) return;
    const off = bridge.onCommand(command => {
      const session = command.mode === 'upper_body' ? current.current.upper : current.current.keyboard;
      const state = session.controls.getState();
      if (command.owner !== owner || command.run !== state.run || !commandAllowed(state, command.action)) return { ok: false };
      if (command.action === 'start') session.start(); else session.controls[command.action]();
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
  return null;
}
