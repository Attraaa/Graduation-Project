import { KeyboardCard, UpperCard } from '../features/dashboard/ModeCards';
import RecordingStatus from '../features/records/RecordingStatus';
import LiveScoreChart from '../features/session/LiveScoreChart';
import { useMonitoring } from '../features/session/monitoringContext';

/**
 * 학습(시안 27): 상체·키보드를 두 열로 나누고 열마다 지금 점수, 카메라 화면, 최근 5분 그래프를 모읍니다.
 * 지난 점수는 통계(날짜별·시간대별, 이탈 시간대), 하루 기록은 학습이력에 있습니다.
 */
const Dashboard = () => {
  const { upper, keyboard } = useMonitoring();
  return (
    <div className="space-y-3">
      <h1 className="sr-only">학습</h1>
      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-2">
        <UpperCard chart={<LiveScoreChart points={upper.trend} />} />
        <KeyboardCard chart={<LiveScoreChart points={keyboard.trend} keyboard />} />
      </div>
      <RecordingStatus />
    </div>
  );
};

export default Dashboard;
