import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../src/components/Sidebar';
import { DialogProvider } from '../src/components/AppDialog';
import WindowTitleBar from '../src/components/layout/WindowTitleBar';
import { emptyEyeSnapshot } from '../src/features/eye/measurement';
import { initialKeyboardSnapshot } from '../src/features/keyboard/monitorTypes';
import { createMonitorSnapshot } from '../src/features/posture/monitorTypes';
import { MonitoringContext } from '../src/features/session/monitoringContext';
import type { MonitoringState } from '../src/features/session/monitoringContext';
import Dashboard from '../src/pages/Dashboard';
import '../src/index.css';
import '../src/components/dialog/modal.css';

const points = Array.from({ length: 60 }, (_, index) => ({ at: 21.25 + 5000 * index, neck: 76 + Math.round(7 * Math.sin(index / 6)),
  balance: 92 + Math.round(4 * Math.cos(index / 5)), keyboard: 82 + Math.round(6 * Math.cos(index / 4)) }));
const posture = createMonitorSnapshot();
const camera = { runtime: { current: { canvas: null, overlay: null } }, open() {} };
const scenario = new URLSearchParams(location.search).get('posture');
const phase = scenario === 'calibrating' || scenario === 'error' ? scenario : 'observing';

function useMockSession() {
  const [running, setRunning] = useState(false), [paused, setPaused] = useState(false);
  return {
    controls: { isRunning: running, isPaused: paused, elapsedSeconds: 295, run: 1, failed: false,
      getState: () => ({ running, paused, run: 1 }), stop: () => { setRunning(false); setPaused(false); return 295; },
      pause: () => setPaused(true), resume: () => setPaused(false) },
    start: () => setRunning(true), camera, trend: points,
  };
}

function Fixture() {
  const upper = useMockSession(), keyboard = useMockSession();
  const observed = phase === 'observing';
  const tracking = {
    upper: { ...upper, snapshot: { ...posture, phase, neck: { ...posture.neck, currentScore: observed ? 100 : null },
      balance: { ...posture.balance, currentScore: observed ? 100 : null }, runAverages: { neck: 78, balance: 91 },
      ...(phase === 'calibrating' ? { progress: .4, neckModel: { step: 'collect', secondsLeft: 3, failure: null } } : {}) },
    eye: { phase: phase === 'calibrating' ? 'calibrating' : 'observing', measurement: { ...emptyEyeSnapshot(),
      calibrationPhase: 'eyes', calibrationBlinks: 1, recentBlinksPerMinute: observed ? 15.2 : null, blinksPerMinute: observed ? 14.7 : null } }, recalibrate() {} },
    keyboard: { ...keyboard, snapshot: { ...initialKeyboardSnapshot, phase: 'ready', scores: [100, 70, 100],
      counts: [{ code: 'KeyF', context: 'plain', verdict: 'preferred', finger: 'left:index', reason: 'preferred-finger', count: 62, date: '2026-11-27' }] }, remap() {} },
  } as unknown as MonitoringState;
  return <div className="desktop-window"><WindowTitleBar /><div className="flex h-screen w-screen bg-background">
    <MonitoringContext.Provider value={tracking}>
      <Sidebar /><main className="min-w-0 flex-1 overflow-y-auto p-3 pb-[4.5rem] md:p-5"><div className="mx-auto h-full max-w-7xl"><Dashboard /></div></main>
    </MonitoringContext.Provider>
  </div></div>;
}

createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/dashboard']}><DialogProvider><Fixture /></DialogProvider></MemoryRouter>);
