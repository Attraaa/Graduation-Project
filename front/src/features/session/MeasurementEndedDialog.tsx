import { useId } from 'react';
import { Check } from 'lucide-react';
import Button from '../../components/Button';
import ModalFrame from '../../components/dialog/ModalFrame';
import { modeName, type MonitoringMode } from './modes';
import { measurementDuration, type MeasurementSummary } from './measurementSummary';

export default function MeasurementEndedDialog({ mode, remaining, summary, onClose, onStatistics, className, error }: {
  mode: MonitoringMode;
  remaining: { mode: MonitoringMode; paused: boolean } | null;
  summary?: MeasurementSummary;
  onClose: () => void;
  onStatistics: () => void;
  className?: string;
  error?: string;
}) {
  const title = useId(), description = useId();
  const other = remaining && modeName(remaining.mode);
  const accent = mode === 'upper_body' ? 'bg-mode-upper-soft text-mode-upper' : 'bg-mode-keyboard-soft text-mode-keyboard';
  return <ModalFrame aria-labelledby={title} aria-describedby={remaining ? description : undefined} onDismiss={onClose} className={`measurement-completion ${className ?? ''}`}>
    <header className="flex items-center gap-3">
      <span aria-hidden="true" className={`measurement-completion-icon grid size-11 shrink-0 place-items-center rounded-2xl ${accent}`}><Check size={22} strokeWidth={3} /></span>
      <h2 id={title} className="text-lg font-black leading-tight">{modeName(mode)} 측정이 종료되었습니다</h2>
    </header>
    {summary && <dl className="mt-4 grid grid-cols-3 gap-y-3 rounded-2xl border border-border bg-surface-muted p-3 sm:p-4">
      <div className="col-span-3 flex items-center justify-between gap-2 border-b border-border pb-2">
        <dt className="text-sm font-bold text-muted">측정 시간</dt>
        <dd className="text-base font-extrabold tabular-nums text-heading">{measurementDuration(summary.seconds)}</dd>
      </div>
      {summary.metrics.map(metric => <div key={metric.label} className="min-w-0 text-center">
        <dt className="break-keep text-xs font-semibold text-muted">{metric.label}</dt>
        <dd className="mt-1 font-extrabold tabular-nums text-heading">
          {metric.value === null ? '—' : <>{metric.value.toFixed(metric.digits ?? 0)} <small className="text-xs font-semibold text-muted">{metric.unit}</small></>}
        </dd>
      </div>)}
    </dl>}
    {remaining && <p id={description} className="measurement-completion-note mt-3 text-sm text-muted">
      {remaining.paused ? `${other} 측정은 일시정지 상태입니다.` : `${other} 측정은 계속 진행 중입니다.`}
    </p>}
    {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
    <div className="measurement-completion-actions mt-4 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
      <Button data-modal-autofocus type="button" variant="outline" className="py-2! text-sm" onClick={onClose}>닫기</Button>
      <Button type="button" variant="secondary" className="py-2! text-sm" onClick={onStatistics}>통계로 이동하기</Button>
    </div>
  </ModalFrame>;
}
