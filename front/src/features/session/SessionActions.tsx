import { Pause, Play, Square } from 'lucide-react';
import { useMonitoring, type MonitoringMode } from './monitoringContext';

const BASE = 'inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border px-3 text-[13px] font-bold transition-colors';
const QUIET = `${BASE} border-border bg-surface-muted hover:bg-nav-active`;
const GO = `${BASE} border-primary-soft-border bg-primary-soft text-primary-soft-text hover:brightness-95`;

/**
 * 카드 머리의 측정 제어(시안 27). 실행 중이면 일시정지(일시정지 중이면 재개)와 중지만, 멈춰 있으면 시작만 보여 줍니다.
 * 진한 채움 색 대신 시작·재개는 옅은 초록, 중지는 빨간 글자로만 구분합니다.
 */
export default function SessionActions({ modeId }: { modeId: MonitoringMode }) {
  const all = useMonitoring();
  const session = modeId === 'upper_body' ? all.upper : all.keyboard;
  const name = modeId === 'upper_body' ? '상체' : '키보드';
  const { controls } = session;
  return <div role="group" aria-label={`${name} 측정 제어`} className="flex items-center gap-1.5">
    {controls.isRunning ? <>
      <button type="button" aria-label={`${name} ${controls.isPaused ? '재개' : '일시정지'}`} onClick={controls.isPaused ? controls.resume : controls.pause}
        className={controls.isPaused ? GO : `${QUIET} text-heading`}>
        {controls.isPaused ? <Play size={13} fill="currentColor" /> : <Pause size={13} fill="currentColor" />}{controls.isPaused ? '재개' : '일시정지'}
      </button>
      <button type="button" aria-label={`${name} 중지`} onClick={controls.stop} className={`${QUIET} text-danger-text`}><Square size={12} fill="currentColor" />중지</button>
    </> : <button type="button" aria-label={`${name} 시작`} onClick={session.start} className={GO}><Play size={13} fill="currentColor" />시작</button>}
  </div>;
}
