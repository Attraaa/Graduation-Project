import { useMonitoring, type MonitoringMode } from './monitoringContext';
import { sessionLabel } from './presentation';

const sessionTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
export default function SessionStatus({ modeId, detailed = false }: { modeId: MonitoringMode; detailed?: boolean }) {
  const all = useMonitoring();
  const { controls, snapshot } = modeId === 'upper_body' ? all.upper : all.keyboard;
  const state = sessionLabel(controls, snapshot.phase);
  if (detailed) return <div role="status" className="session-status"><span className="session-status-label" title={state}><i className={controls.isRunning && !controls.isPaused ? 'active' : ''} />{state}</span><span className="session-clock" aria-label="세션 활성 시간">{sessionTime(controls.elapsedSeconds)}</span></div>;
  return <p role="status" className="flex flex-wrap items-center gap-2 text-xs text-muted"><span className={`h-1.5 w-1.5 rounded-full ${controls.isRunning && !controls.isPaused && snapshot.phase !== 'error' ? 'bg-primary' : 'bg-muted'}`} />{state} · {sessionTime(controls.elapsedSeconds)}</p>;
}
