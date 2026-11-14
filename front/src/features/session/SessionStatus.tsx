import { useMonitoring, type MonitoringMode } from './monitoringContext';
import { sessionLabel } from './presentation';

const sessionTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
export default function SessionStatus({ modeId }: { modeId: MonitoringMode }) {
  const all = useMonitoring();
  const { controls, snapshot } = modeId === 'upper_body' ? all.upper : all.keyboard;
  const state = sessionLabel(controls, snapshot.phase);
  return <p role="status" className="flex flex-wrap items-center gap-2 text-xs text-muted"><span className={`h-1.5 w-1.5 rounded-full ${controls.isRunning && !controls.isPaused && snapshot.phase !== 'error' ? 'bg-primary' : 'bg-muted'}`} />{state} · {sessionTime(controls.elapsedSeconds)}</p>;
}
