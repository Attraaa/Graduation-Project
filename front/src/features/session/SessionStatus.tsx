import { useMonitoring } from './monitoringContext';
import type { MonitoringMode } from './modes';
import { sessionLabel } from './presentation';

const sessionTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
export default function SessionStatus({ modeId }: { modeId: MonitoringMode }) {
  const all = useMonitoring();
  const { controls, snapshot } = modeId === 'upper_body' ? all.upper : all.keyboard;
  const state = sessionLabel(controls, snapshot.phase);
  return <p role="status" className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted">
    <span className={`size-1.5 shrink-0 rounded-full ${controls.isRunning && !controls.isPaused && snapshot.phase !== 'error' ? 'bg-primary' : 'bg-muted'}`} />
    <span className="truncate" title={state}>{state}</span><span className="shrink-0 tabular-nums">· {sessionTime(controls.elapsedSeconds)}</span>
  </p>;
}
