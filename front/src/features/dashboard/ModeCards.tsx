import { Activity, Eye, Keyboard } from 'lucide-react';
import ModeCard from './ModeCard';
import PlayButton from './PlayButton';
import ScoreRing from './ScoreRing';
import Sparkline from './Sparkline';
import { SourceError, SourceLoading } from './SourceState';
import type { SourceStatus } from './SourceState';
import { minutesText, rateText } from './format';
import type { DashboardSummary } from './summary';

interface CardProps { summary: DashboardSummary; status: SourceStatus; onRetry: () => void; className?: string }

const caption = (recent: boolean, todayPresent: boolean, text: string) =>
  !recent ? '아직 기록 없음' : !todayPresent ? '오늘 기록 없음' : text;

export function UpperCard({ summary, status, onRetry, className = '' }: CardProps) {
  const today = summary.today.upper;
  return (
    <ModeCard className={className} title="상체" subtitle="목과 어깨를 함께 봐요" icon={<Activity size={18} />}
      iconClass="bg-mode-upper-soft text-mode-upper"
      action={<PlayButton modeId="upper_body" label="상체 측정 시작" colorClass="bg-mode-upper" />}>
      {status === 'loading' ? <SourceLoading /> : status === 'error' ? <SourceError onRetry={onRetry} /> : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-4">
            <ScoreRing value={today.turtle} strokeClass="stroke-mode-upper" label="목" />
            <ScoreRing value={today.shoulder} strokeClass="stroke-mode-shoulder" label="어깨" />
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <Sparkline label="최근 7일 목·어깨 점수" lines={[
              { values: summary.days.map(day => day.upper.turtle), strokeClass: 'stroke-mode-upper' },
              { values: summary.days.map(day => day.upper.shoulder), strokeClass: 'stroke-mode-shoulder' },
            ]} />
            <p className="text-xs text-muted">
              {caption(summary.recent.upper, today.sessions > 0, `오늘 ${minutesText(today.runMs)} · 기준 이탈 ${today.deviations}회`)}
            </p>
          </div>
        </div>
      )}
    </ModeCard>
  );
}

export function KeyboardCard({ summary, status, onRetry, className = '' }: CardProps) {
  const today = summary.today.keyboard;
  return (
    <ModeCard className={className} title="키보드" icon={<Keyboard size={18} />}
      iconClass="bg-mode-keyboard-soft text-mode-keyboard"
      action={<PlayButton modeId="keyboard" label="키보드 측정 시작" colorClass="bg-mode-keyboard" />}>
      {status === 'loading' ? <SourceLoading /> : status === 'error' ? <SourceError onRetry={onRetry} /> : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ScoreRing value={today.score} strokeClass="stroke-mode-keyboard" label="손가락" />
          <div className="flex flex-col items-end gap-1 text-right">
            <Sparkline label="최근 7일 키보드 점수"
              lines={[{ values: summary.days.map(day => day.keyboard.score), strokeClass: 'stroke-mode-keyboard' }]} />
            <p className="text-xs text-muted">{caption(summary.recent.keyboard, today.present, `오늘 ${minutesText(today.runMs)}`)}</p>
            {today.present && today.coverage !== null && (
              <p className="text-xs text-muted">{`판정 가능 ${Math.round(today.coverage)}%`}</p>
            )}
          </div>
        </div>
      )}
    </ModeCard>
  );
}

export function EyeCard({ summary, status, onRetry, className = '' }: CardProps) {
  const today = summary.today.eye;
  return (
    <ModeCard className={className} title="안구" icon={<Eye size={18} />}
      iconClass="bg-mode-eye-soft text-mode-eye"
      action={<PlayButton modeId="eye" label="안구 측정 시작" colorClass="bg-mode-eye" />}>
      {status === 'loading' ? <SourceLoading /> : status === 'error' ? <SourceError onRetry={onRetry} /> : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2" aria-label={`오늘 깜빡임 ${rateText(today.rate)}`}>
            <span className="text-3xl font-extrabold text-heading">{today.rate === null ? '—' : Math.round(today.rate)}</span>
            <span className="text-xs leading-tight text-muted">회/분<br />깜빡임</span>
          </p>
          <div className="flex flex-col items-end gap-1 text-right">
            <Sparkline label="최근 7일 깜빡임 빈도"
              lines={[{ values: summary.days.map(day => day.eye.rate), strokeClass: 'stroke-mode-eye' }]} />
            <p className="text-xs text-muted">{caption(summary.recent.eye, today.present, `오늘 ${minutesText(today.runMs)}`)}</p>
            {today.present && <p className="text-xs text-muted">{`휴식 ${today.breaks}회`}</p>}
          </div>
        </div>
      )}
    </ModeCard>
  );
}
