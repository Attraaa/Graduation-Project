import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyboardCard, UpperCard } from '../features/dashboard/ModeCards';
import RecordingStatus from '../features/records/RecordingStatus';
import LiveScoreChart from '../features/session/LiveScoreChart';
import MeasurementEndedDialog from '../features/session/MeasurementEndedDialog';
import { useMonitoring } from '../features/session/monitoringContext';
import { otherMode, statisticsTarget, type MonitoringMode } from '../features/session/modes';
import { measurementSummary, type MeasurementSummary } from '../features/session/measurementSummary';

/**
 * 학습(시안 27): 상체·키보드를 두 열로 나누고 열마다 지금 점수, 카메라 화면, 최근 5분 그래프를 모읍니다.
 * 지난 점수는 통계(날짜별·시간대별, 이탈 시간대), 하루 기록은 학습이력에 있습니다.
 */
const SHARED_ROWS = 'md:row-span-4 md:grid md:grid-rows-subgrid md:gap-y-0';

const Dashboard = () => {
  const monitoring = useMonitoring();
  const { upper, keyboard } = monitoring;
  const navigate = useNavigate();
  const [ended, setEnded] = useState<{ mode: MonitoringMode; summary: MeasurementSummary } | null>(null);
  const stop = (mode: MonitoringMode) => {
    const { controls } = mode === 'upper_body' ? upper : keyboard;
    if (!controls.getState().running) return;
    setEnded({ mode, summary: measurementSummary(monitoring, mode, controls.stop()) });
  };
  const remaining = ended?.mode === 'upper_body' ? keyboard.controls : upper.controls;
  return (
    <div className="flex min-h-full flex-col gap-3 md:h-full">
      <h1 className="sr-only">학습</h1>
      <div className="grid flex-1 grid-cols-1 gap-3.5 md:min-h-0 md:grid-cols-2 md:grid-rows-[auto_auto_minmax(7rem,1.2fr)_minmax(8.5rem,1fr)] md:gap-y-0">
        <UpperCard className={SHARED_ROWS} onStop={stop} chart={<LiveScoreChart points={upper.trend} />} />
        <KeyboardCard className={SHARED_ROWS} onStop={stop} chart={<LiveScoreChart points={keyboard.trend} keyboard />} />
      </div>
      <RecordingStatus errorsOnly />
      {ended && <MeasurementEndedDialog mode={ended.mode} summary={ended.summary}
        remaining={remaining.isRunning ? { mode: otherMode(ended.mode), paused: remaining.isPaused } : null}
        onClose={() => setEnded(null)} onStatistics={() => navigate(statisticsTarget(ended.mode))} />}
    </div>
  );
};

export default Dashboard;
