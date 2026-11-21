import { Pause, Play, Square } from 'lucide-react';
import { useMonitoring, type MonitoringMode } from './monitoringContext';

export default function SessionActions({ modeId }: { modeId: MonitoringMode }) {
  const all = useMonitoring();
  const session = modeId === 'upper_body' ? all.upper : all.keyboard;
  const name = modeId === 'upper_body' ? '상체' : '키보드';
  const { controls } = session;
  const style = 'inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-2 py-2 text-sm font-bold transition disabled:cursor-default disabled:opacity-40';
  const startStyle = `${style} border-primary-border bg-primary text-white hover:bg-primary-hover`;
  return <div role="group" aria-label={`${name} 측정 제어`} className="grid grid-cols-3 gap-2">
    <button type="button" aria-label={`${name} 시작`} disabled={controls.isRunning} onClick={session.start} className={startStyle}><Play size={16} className="hidden shrink-0 sm:block" />시작</button>
    <button type="button" aria-label={`${name} ${controls.isPaused ? '재개' : '일시정지'}`} disabled={!controls.isRunning} onClick={controls.isPaused ? controls.resume : controls.pause} className={controls.isPaused ? startStyle : `${style} border-warning-border bg-warning text-warning-foreground hover:opacity-90`}>{controls.isPaused ? <Play size={16} className="hidden shrink-0 sm:block" /> : <Pause size={16} className="hidden shrink-0 sm:block" />}{controls.isPaused ? '재개' : '일시정지'}</button>
    <button type="button" aria-label={`${name} 중지`} disabled={!controls.isRunning} onClick={controls.stop} className={`${style} border-danger-border bg-danger text-white hover:opacity-90`}><Square size={16} className="hidden shrink-0 sm:block" />중지</button>
  </div>;
}
