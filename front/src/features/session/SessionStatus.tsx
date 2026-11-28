import { useMonitoring } from './monitoringContext';
import type { MonitoringMode } from './modes';
import { sessionLabel } from './presentation';

const sessionTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
export default function SessionStatus({ modeId }: { modeId: MonitoringMode }) {
  const all = useMonitoring();
  const { controls, snapshot } = modeId === 'upper_body' ? all.upper : all.keyboard;
  const state = sessionLabel(controls, snapshot.phase);
  return <p className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-1.5 text-xs text-muted @min-[18rem]/monitor:grid-cols-[auto_minmax(0,1fr)_auto]">
    <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${controls.isRunning && !controls.isPaused && snapshot.phase !== 'error' ? 'bg-primary' : 'bg-muted'}`} />
    <span role="status" className="break-keep @min-[18rem]/monitor:truncate" title={state}>{state}</span>
    <span className="col-start-2 whitespace-nowrap tabular-nums @min-[18rem]/monitor:col-start-3 @min-[18rem]/monitor:row-start-1">
      <span aria-hidden="true" className="hidden @min-[18rem]/monitor:inline">· </span><span className="sr-only">경과 시간 </span>{sessionTime(controls.elapsedSeconds)}
    </span>
  </p>;
}
