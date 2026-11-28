import { Activity, Keyboard, RotateCcw, Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';
import MonitoringPreview from '../session/MonitoringPreview';
import SessionActions from '../session/SessionActions';
import SessionStatus from '../session/SessionStatus';
import { useMonitoring } from '../session/monitoringContext';
import PostureMetrics from '../posture/PostureMetrics';
import CameraGuidance from '../posture/CameraGuidance';
import KeyboardGuidance from '../session/KeyboardGuidance';
import MetricTile from '../session/MetricTile';
import ScoreDial from '../session/ScoreDial';
import { keyboardSummary } from '../../../../database/keyboard';
import { liveAverage } from '../keyboard/liveScore';
import { modeName, type MonitoringMode } from '../session/modes';

type CardProps = { chart?: ReactNode; className?: string; compactVisible?: boolean; onStop?: (mode: MonitoringMode) => void };

/**
 * 홈의 모드 한 열(시안 27): 머리(이름·상태·측정 제어·카메라 설정) → 지금 점수 → 카메라 화면 → 최근 5분 그래프.
 * 그래프는 Dashboard가 넘겨 줍니다. 안내는 따로 칸을 두지 않고 카메라 화면 안 아래쪽 띠에 그립니다.
 */
function LiveCard({ modeId, metrics, chart, className, compactVisible, onStop }: CardProps & { modeId: MonitoringMode; metrics: ReactNode }) {
  const all = useMonitoring();
  const upper = modeId === 'upper_body';
  const session = upper ? all.upper : all.keyboard;
  const name = modeName(modeId);
  const recaptureLabel = upper ? '기준 다시 잡기' : '위치 다시 잡기';
  return <section id={`dashboard-${modeId}`} aria-label={`${name} 모니터링`} data-compact-visible={compactVisible}
    className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface ${className ?? ''}`}>
    <header className="@container/monitor grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`hidden size-9 shrink-0 items-center justify-center rounded-[10px] @min-[24rem]/monitor:flex ${upper ? 'bg-mode-upper-soft text-mode-upper' : 'bg-mode-keyboard-soft text-mode-keyboard'}`}>{upper ? <Activity size={18} /> : <Keyboard size={18} />}</span>
        <div className="min-w-0"><h2 className={`${compactVisible === undefined ? '' : 'sr-only md:not-sr-only '}font-bold leading-5 text-heading`}>{name}</h2><SessionStatus modeId={modeId} /></div>
      </div>
      <div className="flex items-center gap-1.5">
        <SessionActions modeId={modeId} onStop={onStop} />
        {session.controls.isRunning && <button type="button" disabled={session.controls.isPaused}
          onClick={upper ? all.upper.recalibrate : all.keyboard.remap} aria-label={`${name} ${recaptureLabel}`} title={recaptureLabel}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-border text-xs font-bold text-heading hover:bg-surface-muted disabled:opacity-50 @min-[32rem]/monitor:w-auto @min-[32rem]/monitor:px-2.5">
          <RotateCcw size={14} /><span className="hidden @min-[32rem]/monitor:inline">{recaptureLabel}</span>
        </button>}
        <button type="button" onClick={session.camera.open} aria-label={`${name} 카메라 설정`} title="카메라 설정"
          className="flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-border text-muted hover:bg-surface-muted @min-[34rem]/monitor:w-auto @min-[34rem]/monitor:px-2.5">
          <Settings2 size={17} /><span className="hidden text-xs font-bold @min-[34rem]/monitor:inline">카메라</span>
        </button>
      </div>
    </header>
    <div className="dashboard-metrics @container px-3.5 py-2.5 [--monitor-meter-size:clamp(3.5rem,min(22cqw,13dvh),6.5rem)]">{metrics}</div>
    <MonitoringPreview modeId={modeId} fitHeight={!!chart}>{upper ? <CameraGuidance /> : <KeyboardGuidance />}</MonitoringPreview>
    {chart && <div className="dashboard-trend flex min-h-0 min-w-0 flex-1 flex-col px-3.5 pb-2.5 pt-2">{chart}</div>}
  </section>;
}
export function UpperCard(props: CardProps) {
  const { upper } = useMonitoring();
  return <LiveCard {...props} modeId="upper_body"
    metrics={<PostureMetrics snapshot={upper.snapshot} eye={upper.eye.measurement} isRunning={upper.controls.isRunning} />} />;
}
export function KeyboardCard(props: CardProps) {
  const { keyboard } = useMonitoring();
  const totals = keyboardSummary(keyboard.snapshot.counts);
  // The average of the last 50 judged presses, not the score of a single press.
  const score = keyboard.controls.isRunning ? liveAverage(keyboard.snapshot.scores) : null;
  return <LiveCard {...props} modeId="keyboard" metrics={<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-start gap-2">
    <ScoreDial label="현재 점수" value={score} strokeClass="stroke-mode-keyboard" />
    <div className="flex min-h-[var(--monitor-meter-size,6.5rem)] flex-col justify-center gap-1 border-l border-border pl-4">
      <MetricTile label="판정 가능 비율" value={totals.coverage === null ? null : totals.coverage.toFixed(1)} unit="%" />
      <MetricTile label="판정한 입력" value={String(totals.valid)} unit="회" />
    </div>
  </div>} />;
}
