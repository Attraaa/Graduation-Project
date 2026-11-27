import { Pause, Play, Square } from 'lucide-react';
import { useMonitoring } from './monitoringContext';
import { modeName, type MonitoringMode } from './modes';

const BASE = 'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border text-[13px] font-bold transition-colors';
const ACTIVE = `${BASE} w-9 @min-[25rem]/monitor:w-auto @min-[25rem]/monitor:px-2.5`;
const LABEL = 'hidden @min-[25rem]/monitor:inline';
const QUIET = 'border-border bg-surface-muted hover:bg-nav-active';
const GO = 'border-primary-soft-border bg-primary-soft text-primary-soft-text hover:brightness-95';

/**
 * 카드 머리의 측정 제어(시안 27). 실행 중이면 일시정지(일시정지 중이면 재개)와 중지만, 멈춰 있으면 시작만 보여 줍니다.
 * 진한 채움 색 대신 시작·재개는 옅은 초록, 중지는 빨간 글자로만 구분합니다.
 */
export default function SessionActions({ modeId, onStop }: { modeId: MonitoringMode; onStop?: (mode: MonitoringMode) => void }) {
  const all = useMonitoring();
  const session = modeId === 'upper_body' ? all.upper : all.keyboard;
  const name = modeName(modeId);
  const { controls } = session;
  const pauseLabel = controls.isPaused ? '재개' : '일시정지';
  return <div role="group" aria-label={`${name} 측정 제어`} className="flex items-center gap-1.5">
    {controls.isRunning ? <>
      <button type="button" aria-label={`${name} ${pauseLabel}`} title={pauseLabel} onClick={controls.isPaused ? controls.resume : controls.pause}
        className={`${ACTIVE} ${controls.isPaused ? GO : `${QUIET} text-heading`}`}>
        {controls.isPaused ? <Play size={13} fill="currentColor" /> : <Pause size={13} fill="currentColor" />}
        <span className={LABEL}>{pauseLabel}</span>
      </button>
      <button type="button" aria-label={`${name} 중지`} title="중지" onClick={onStop ? () => onStop(modeId) : controls.stop} className={`${ACTIVE} ${QUIET} text-danger-text`}>
        <Square size={12} fill="currentColor" /><span className={LABEL}>중지</span>
      </button>
    </> : <button type="button" aria-label={`${name} 시작`} onClick={session.start} className={`${BASE} ${GO} px-3`}><Play size={13} fill="currentColor" />시작</button>}
  </div>;
}
