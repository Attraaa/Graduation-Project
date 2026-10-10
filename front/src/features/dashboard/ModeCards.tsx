import { Activity, Keyboard, Settings2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import MonitoringPreview from '../session/MonitoringPreview';
import SessionActions from '../session/SessionActions';
import SessionStatus from '../session/SessionStatus';
import { useMonitoring, type MonitoringMode } from '../session/monitoringContext';
import PostureMetrics from '../posture/PostureMetrics';
import EyeCalibrationGuide from '../eye/EyeCalibrationGuide';
import Metric from '../session/Metric';
import { keyboardSummary } from '../../../../database/keyboard';
import { percentText, scoreText } from '../keyboard/labels';
import { livePressScore } from '../keyboard/liveScore';

function LiveCard({ modeId, children, className }: { modeId: MonitoringMode; children: ReactNode; className?: string }) {
  const upper = modeId === 'upper_body';
  const state = useMonitoring();
  const session = upper ? state.upper : state.keyboard;
  const error = session.controls.isRunning && session.snapshot.phase === 'error';
  return <section aria-label={`${upper ? '상체' : '키보드'} 모니터링`} className={`min-w-0 space-y-3 rounded-2xl border border-border bg-surface p-4 ${className ?? ''}`}>
    <header className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${upper ? 'bg-mode-upper-soft text-mode-upper' : 'bg-mode-keyboard-soft text-mode-keyboard'}`}>{upper ? <Activity size={20} /> : <Keyboard size={20} />}</span><div><h2 className="font-bold text-heading">{upper ? '상체' : '키보드'}</h2><p className="mt-1 text-xs text-muted">{upper ? '목·어깨·안구 함께' : '손가락 사용 관찰'}</p></div></div>
      <Link to={`/learn/${modeId}`} aria-label={`${upper ? '상체' : '키보드'} 설정·상세`} title="설정·상세" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted hover:bg-surface-muted"><Settings2 size={17} /></Link>
    </header>
    <MonitoringPreview modeId={modeId} />
    <div className="flex flex-wrap items-center justify-between gap-2"><SessionStatus modeId={modeId} /><SessionActions modeId={modeId} /></div>
    {error && <p role="alert" className="text-sm text-danger">{upper ? '카메라·분석 연결을 확인해 주세요.' : state.keyboard.snapshot.message}</p>}
    {children}
  </section>;
}
export function UpperCard({ className }: { className?: string }) {
  const { upper } = useMonitoring();
  return <LiveCard modeId="upper_body" className={className}>
    {upper.controls.isRunning && !upper.controls.isPaused && upper.eye.phase === 'calibrating' && <EyeCalibrationGuide measurement={upper.eye.measurement} />}
    {upper.controls.isRunning && upper.eye.phase === 'error' && <p role="alert" className="text-sm text-danger">깜빡임 분석: {upper.eye.message}</p>}
    <PostureMetrics snapshot={upper.snapshot} eye={upper.eye.measurement} isRunning={upper.controls.isRunning} />
  </LiveCard>;
}
export function KeyboardCard({ className }: { className?: string }) {
  const { keyboard } = useMonitoring();
  const totals = keyboardSummary(keyboard.snapshot.counts);
  return <LiveCard modeId="keyboard" className={className}><div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
    <Metric compact label="현재 점수" value={scoreText(keyboard.controls.isRunning ? livePressScore(keyboard.snapshot.latest) : null)} detail={`세션 평균 ${scoreText(totals.score)}`} />
    <Metric compact label="판정 가능 비율" value={percentText(totals.coverage)} detail={`보류 ${totals.unknown}회`} />
    <Metric compact label="판정한 입력" value={`${totals.valid}회`} detail={`확인한 입력 ${keyboard.snapshot.detectedPresses}회`} />
  </div></LiveCard>;
}
