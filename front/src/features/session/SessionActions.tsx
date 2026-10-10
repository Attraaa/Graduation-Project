import { Pause, Play, Square } from 'lucide-react';
import { useMonitoring, type MonitoringMode } from './monitoringContext';

export default function SessionActions({ modeId }: { modeId: MonitoringMode }) {
  const all = useMonitoring();
  const session = modeId === 'upper_body' ? all.upper : all.keyboard;
  const name = modeId === 'upper_body' ? '상체' : '키보드';
  const { controls } = session;
  const style = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition';
  const startStyle = `${style} border-primary-border bg-primary text-white hover:bg-primary-hover`;
  return <div className="flex flex-wrap gap-2">
    {!controls.isRunning ? <button type="button" aria-label={`${name} 시작`} onClick={session.start} className={startStyle}><Play size={16} />시작</button> : <>
      <button type="button" aria-label={`${name} ${controls.isPaused ? '재개' : '일시정지'}`} onClick={controls.isPaused ? controls.resume : controls.pause} className={controls.isPaused ? startStyle : `${style} border-warning-border bg-warning text-warning-foreground hover:opacity-90`}>{controls.isPaused ? <Play size={16} /> : <Pause size={16} />}{controls.isPaused ? '재개' : '일시정지'}</button>
      <button type="button" aria-label={`${name} 중지`} onClick={controls.stop} className={`${style} border-danger-border bg-danger text-white hover:opacity-90`}><Square size={16} />중지</button>
    </>}
  </div>;
}
