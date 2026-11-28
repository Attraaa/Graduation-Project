import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { KeyboardCard, UpperCard } from '../features/dashboard/ModeCards';
import LiveScoreChart from '../features/session/LiveScoreChart';
import MeasurementEndedDialog from '../features/session/MeasurementEndedDialog';
import { useMonitoring } from '../features/session/monitoringContext';
import { modeName, otherMode, statisticsTarget, type MonitoringMode } from '../features/session/modes';
import { measurementSummary, type MeasurementSummary } from '../features/session/measurementSummary';
import { sessionLabel } from '../features/session/presentation';
import '../features/dashboard/dashboard.css';

/**
 * 학습(시안 27): 상체·키보드를 두 열로 나누고 열마다 지금 점수, 카메라 화면, 최근 5분 그래프를 모읍니다.
 * 지난 점수는 통계(날짜별·시간대별, 이탈 시간대), 하루 기록은 학습이력에 있습니다.
 */
const MODES = ['upper_body', 'keyboard'] as const;
const CARD_LAYOUT = 'dashboard-card md:row-span-4 md:grid md:grid-rows-subgrid';

const Dashboard = () => {
  const monitoring = useMonitoring();
  const { upper, keyboard } = monitoring;
  const navigate = useNavigate();
  const location = useLocation();
  const cards = useRef<HTMLDivElement>(null);
  const [ended, setEnded] = useState<{ mode: MonitoringMode; summary: MeasurementSummary } | null>(null);
  const [selection, setSelection] = useState<{ location: typeof location; mode: MonitoringMode }>();
  const requested = new URLSearchParams(location.search).get('mode');
  const requestedMode = MODES.find(mode => mode === requested);
  const activeMode = keyboard.controls.isRunning && !upper.controls.isRunning ? 'keyboard' : 'upper_body';
  const visible = selection?.location === location ? selection.mode : requestedMode ?? activeMode;
  const show = (mode: MonitoringMode) => setSelection({ location, mode });
  const stop = (mode: MonitoringMode) => {
    const { controls } = mode === 'upper_body' ? upper : keyboard;
    if (!controls.getState().running) return;
    show(mode);
    setEnded({ mode, summary: measurementSummary(monitoring, mode, controls.stop()) });
  };
  const remaining = ended?.mode === 'upper_body' ? keyboard.controls : upper.controls;
  return (
    <div className="flex h-full flex-col gap-2">
      <h1 className="sr-only">학습</h1>
      <div role="group" aria-label="표시할 측정" className="grid shrink-0 grid-cols-2 gap-1 rounded-xl border border-border bg-surface-muted p-1 md:hidden">
        {MODES.map(mode => {
          const { controls, snapshot } = mode === 'upper_body' ? upper : keyboard;
          const selected = visible === mode;
          const panel = `dashboard-${mode}`;
          return <button key={mode} type="button" aria-label={modeName(mode)} aria-pressed={selected} aria-controls={panel}
            aria-describedby={selected ? undefined : `${panel}-state`} onClick={() => show(mode)}
            className={`flex min-h-9 min-w-0 items-center justify-between gap-1.5 rounded-lg border px-2 text-heading ${selected ? 'border-border bg-surface shadow-sm' : 'border-transparent hover:bg-nav-active'}`}>
            <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-bold">
              <span aria-hidden="true" className={`size-1.5 rounded-full ${mode === 'upper_body' ? 'bg-mode-upper' : 'bg-mode-keyboard'}`} />{modeName(mode)}
            </span>
            {!selected && <span id={`${panel}-state`} className="break-keep text-right text-[11px] leading-tight text-muted">{sessionLabel(controls, snapshot.phase)}</span>}
          </button>;
        })}
      </div>
      <div ref={cards} className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2 md:grid-rows-[auto_auto_minmax(7rem,1.2fr)_minmax(8.5rem,1fr)] md:gap-x-3.5">
        <UpperCard className={CARD_LAYOUT} compactVisible={visible === 'upper_body'} onStop={stop} chart={<LiveScoreChart points={upper.trend} />} />
        <KeyboardCard className={CARD_LAYOUT} compactVisible={visible === 'keyboard'} onStop={stop} chart={<LiveScoreChart points={keyboard.trend} keyboard />} />
      </div>
      {ended && <MeasurementEndedDialog mode={ended.mode} summary={ended.summary}
        remaining={remaining.isRunning ? { mode: otherMode(ended.mode), paused: remaining.isPaused } : null}
        onClose={() => setEnded(null)}
        returnFocus={() => cards.current?.querySelector<HTMLButtonElement>(`#dashboard-${ended.mode} [data-session-start]:not(:disabled)`) ?? null}
        onStatistics={() => navigate(statisticsTarget(ended.mode), { state: { focusStatisticsTab: true } })} />}
    </div>
  );
};

export default Dashboard;
