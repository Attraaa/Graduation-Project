import { RotateCcw } from 'lucide-react';
import SessionFrame from '../session/SessionFrame';
import SessionActions from '../session/SessionActions';
import SessionStatus from '../session/SessionStatus';
import MonitoringPreview from '../session/MonitoringPreview';
import { useMonitoring } from '../session/monitoringContext';
import PostureMetrics from './PostureMetrics';
import RecordingStatus from '../records/RecordingStatus';
import MonitoringNotice from '../session/MonitoringNotice';

export default function PostureSession() {
  const { upper } = useMonitoring();
  const { controls, snapshot } = upper;
  return <SessionFrame modeId="upper_body" camera={upper.camera}
    subtitle="목·어깨 점수와 분당 깜빡임을 함께 확인하세요."
    actions={<button type="button" disabled={!controls.isRunning || controls.isPaused} onClick={upper.recalibrate} className="session-tool"><RotateCcw size={15} />기준 다시 잡기</button>}>
    <div className="session-workspace">
      <section className="session-camera" aria-label="상체 카메라">
        <div className="session-panel-heading"><h2>상체 카메라</h2><span>목 · 어깨 · 깜빡임</span></div>
        <MonitoringPreview modeId="upper_body" detailed />
        <div className="session-controlbar"><SessionStatus modeId="upper_body" detailed /><SessionActions modeId="upper_body" className="session-controls" /></div>
      </section>
      <aside className="session-insights" aria-label="상체 실시간 지표">
        <div className="session-panel-heading"><h2>실시간 지표</h2><span>현재 / 세션 평균</span></div>
        <PostureMetrics snapshot={snapshot} eye={upper.eye.measurement} isRunning={controls.isRunning} rows />
        <div className="session-guidance"><h3>측정 안내</h3><MonitoringNotice modeId="upper_body" /></div>
      </aside>
    </div>
    <RecordingStatus errorsOnly />
  </SessionFrame>;
}
