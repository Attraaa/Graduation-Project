import { KeyboardCard, UpperCard } from '../features/dashboard/ModeCards';
import RecordingStatus from '../features/records/RecordingStatus';
import LiveScoreChart from '../features/session/LiveScoreChart';
import { useMonitoring } from '../features/session/monitoringContext';

/**
 * 학습: the two monitoring cards, each with its live score trend underneath. Past scores are in 통계
 * (daily and hourly charts, deviation hours) and the day's records in 학습이력.
 */
const Dashboard = () => {
  const { upper, keyboard } = useMonitoring();
  return (
    <div className="space-y-4 pb-4">
      <header>
        <h1 className="text-2xl font-extrabold text-heading">무엇을 모니터링 할까요?</h1>
      </header>

      {/* Each card is followed by its trend; on wide screens the cards share the first row and the trends the second. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UpperCard className="lg:order-1" />
        <div className="min-w-0 lg:order-3"><LiveScoreChart points={upper.trend} /></div>
        <KeyboardCard className="lg:order-2" />
        <div className="min-w-0 lg:order-4"><LiveScoreChart points={keyboard.trend} keyboard /></div>
      </div>
      <RecordingStatus />
    </div>
  );
};

export default Dashboard;
