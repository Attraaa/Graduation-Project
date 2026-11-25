import { Activity, Keyboard, Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';
import MonitoringPreview from '../session/MonitoringPreview';
import SessionActions from '../session/SessionActions';
import SessionStatus from '../session/SessionStatus';
import { useMonitoring, type MonitoringMode } from '../session/monitoringContext';
import PostureMetrics from '../posture/PostureMetrics';
import CameraGuidance from '../posture/CameraGuidance';
import KeyboardGuidance from '../session/KeyboardGuidance';
import MetricTile from '../session/MetricTile';
import ScoreDial from '../session/ScoreDial';
import { keyboardSummary } from '../../../../database/keyboard';
import { liveAverage } from '../keyboard/liveScore';

type CardProps = { chart?: ReactNode; className?: string };

/**
 * 홈의 모드 한 열(시안 27): 머리(이름·상태·측정 제어·카메라 설정) → 지금 점수 → 카메라 화면 → 최근 5분 그래프.
 * 그래프는 Dashboard가 넘겨 줍니다. 안내는 따로 칸을 두지 않고 카메라 화면 안 아래쪽 띠에 그립니다.
 */
function LiveCard({ modeId, metrics, chart, className }: CardProps & { modeId: MonitoringMode; metrics: ReactNode }) {
  const all = useMonitoring();
  const upper = modeId === 'upper_body';
  const name = upper ? '상체' : '키보드';
  return <section aria-label={`${name} 모니터링`} className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface ${className ?? ''}`}>
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2.5 pl-3.5 pr-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${upper ? 'bg-mode-upper-soft text-mode-upper' : 'bg-mode-keyboard-soft text-mode-keyboard'}`}>{upper ? <Activity size={18} /> : <Keyboard size={18} />}</span>
        <div className="min-w-0"><h2 className="font-bold leading-5 text-heading">{name}</h2><SessionStatus modeId={modeId} /></div>
      </div>
      <div className="flex items-center gap-1.5">
        <SessionActions modeId={modeId} />
        <button type="button" onClick={() => (upper ? all.upper : all.keyboard).camera.open()} aria-label={`${name} 카메라 설정`} title="카메라 설정" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-border text-muted hover:bg-surface-muted"><Settings2 size={17} /></button>
      </div>
    </header>
    <div className="px-3.5 py-3">{metrics}</div>
    <MonitoringPreview modeId={modeId}>{upper ? <CameraGuidance /> : <KeyboardGuidance />}</MonitoringPreview>
    {chart && <div className="px-3.5 pb-2 pt-2.5">{chart}</div>}
  </section>;
}
export function UpperCard({ chart, className }: CardProps) {
  const { upper } = useMonitoring();
  return <LiveCard modeId="upper_body" chart={chart} className={className}
    metrics={<PostureMetrics snapshot={upper.snapshot} eye={upper.eye.measurement} isRunning={upper.controls.isRunning} />} />;
}
export function KeyboardCard({ chart, className }: CardProps) {
  const { keyboard } = useMonitoring();
  const totals = keyboardSummary(keyboard.snapshot.counts);
  // The average of the last 50 judged presses, not the score of a single press.
  const score = keyboard.controls.isRunning ? liveAverage(keyboard.snapshot.scores) : null;
  return <LiveCard modeId="keyboard" chart={chart} className={className} metrics={<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-start gap-2">
    <ScoreDial label="현재 점수" value={score} strokeClass="stroke-mode-keyboard" />
    <div className="flex h-[104px] flex-col justify-center gap-2 border-l border-border pl-4">
      <MetricTile label="판정 가능 비율" value={totals.coverage === null ? null : totals.coverage.toFixed(1)} unit="%" />
      <MetricTile label="판정한 입력" value={String(totals.valid)} unit="회" />
    </div>
  </div>} />;
}
