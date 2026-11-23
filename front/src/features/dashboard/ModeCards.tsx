import { Activity, Keyboard, Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';
import MonitoringPreview from '../session/MonitoringPreview';
import SessionActions from '../session/SessionActions';
import SessionStatus from '../session/SessionStatus';
import { useMonitoring, type MonitoringMode } from '../session/monitoringContext';
import PostureMetrics from '../posture/PostureMetrics';
import CameraGuidance from '../posture/CameraGuidance';
import KeyboardGuidance from '../session/KeyboardGuidance';
import Metric from '../session/Metric';
import { keyboardSummary } from '../../../../database/keyboard';
import { percentText, scoreText } from '../keyboard/labels';
import { livePressScore } from '../keyboard/liveScore';

function LiveCard({ modeId, children, className }: { modeId: MonitoringMode; children: ReactNode; className?: string }) {
  const all = useMonitoring();
  const upper = modeId === 'upper_body';
  return <section aria-label={`${upper ? '상체' : '키보드'} 모니터링`} className={`min-w-0 space-y-3 rounded-2xl border border-border bg-surface p-4 ${className ?? ''}`}>
    <header className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${upper ? 'bg-mode-upper-soft text-mode-upper' : 'bg-mode-keyboard-soft text-mode-keyboard'}`}>{upper ? <Activity size={20} /> : <Keyboard size={20} />}</span><h2 className="font-bold text-heading">{upper ? '상체' : '키보드'}</h2></div>
      <button type="button" onClick={() => (upper ? all.upper : all.keyboard).camera.open()} aria-label={`${upper ? '상체' : '키보드'} 카메라 설정`} title="카메라 설정" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted hover:bg-surface-muted"><Settings2 size={17} /></button>
    </header>
    {/* Guidance is drawn inside the camera view (no separate notice box). */}
    <MonitoringPreview modeId={modeId}>{upper ? <CameraGuidance /> : <KeyboardGuidance />}</MonitoringPreview>
    <div className="space-y-2"><SessionStatus modeId={modeId} /><SessionActions modeId={modeId} /></div>
    {children}
  </section>;
}
export function UpperCard({ className }: { className?: string }) {
  const { upper } = useMonitoring();
  return <LiveCard modeId="upper_body" className={className}>
    <PostureMetrics snapshot={upper.snapshot} eye={upper.eye.measurement} isRunning={upper.controls.isRunning} />
  </LiveCard>;
}
export function KeyboardCard({ className }: { className?: string }) {
  const { keyboard } = useMonitoring();
  const totals = keyboardSummary(keyboard.snapshot.counts);
  return <LiveCard modeId="keyboard" className={className}><div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
    <Metric compact label="현재 점수" value={scoreText(keyboard.controls.isRunning ? livePressScore(keyboard.snapshot.latest) : null)} />
    <Metric compact label="판정 가능 비율" value={percentText(totals.coverage)} />
    <Metric compact label="판정한 입력" value={`${totals.valid}회`} />
  </div></LiveCard>;
}
