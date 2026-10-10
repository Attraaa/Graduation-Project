import { useMonitoring, type MonitoringMode } from './monitoringContext';

const sessionTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
export default function SessionStatus({ modeId }: { modeId: MonitoringMode }) {
  const all = useMonitoring();
  const { controls, snapshot } = modeId === 'upper_body' ? all.upper : all.keyboard;
  const state = !controls.isRunning ? (controls.elapsedSeconds ? '측정 종료' : '준비됨') : controls.isPaused ? '일시정지'
    : ({ loading: '모델 준비 중', calibrating: '기준 자세 수집', observing: '관찰 중', unavailable: '관찰 일시 불가', error: '분석 오류', idle: '준비 중', starting: '분석기 준비 중', mapping: '키보드 위치 인식', ready: '관찰 중' }[snapshot.phase]);
  return <p role="status" className="flex flex-wrap items-center gap-2 text-xs text-muted"><span className={`h-1.5 w-1.5 rounded-full ${controls.isRunning && !controls.isPaused && snapshot.phase !== 'error' ? 'bg-primary' : 'bg-muted'}`} />{state} · {sessionTime(controls.elapsedSeconds)}</p>;
}
