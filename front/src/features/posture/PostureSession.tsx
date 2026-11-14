import { RotateCcw } from 'lucide-react';
import SessionFrame from '../session/SessionFrame';
import SessionActions from '../session/SessionActions';
import SessionStatus from '../session/SessionStatus';
import MonitoringPreview from '../session/MonitoringPreview';
import LiveScoreChart from '../session/LiveScoreChart';
import { useMonitoring } from '../session/monitoringContext';
import PostureMetrics from './PostureMetrics';
import RecordingStatus from '../records/RecordingStatus';
import MonitoringNotice from '../session/MonitoringNotice';

export default function PostureSession() {
  const { upper } = useMonitoring();
  const { controls, snapshot } = upper;
  return <SessionFrame modeId="upper_body" camera={upper.camera}
    subtitle="목·어깨 점수와 분당 깜빡임을 함께 확인하세요."
    actions={<><button type="button" disabled={!controls.isRunning || controls.isPaused} onClick={upper.recalibrate} className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-bold text-heading disabled:opacity-50"><RotateCcw size={16} />기준 다시 잡기</button><SessionActions modeId="upper_body" className="w-full sm:w-80" /></>}>
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-heading">상체 카메라</h2><SessionStatus modeId="upper_body" /></div>
      <div className="mx-auto w-full max-w-2xl"><MonitoringPreview modeId="upper_body" /></div>
      <MonitoringNotice modeId="upper_body" />
      <PostureMetrics snapshot={snapshot} eye={upper.eye.measurement} isRunning={controls.isRunning} />
    </section>
    <LiveScoreChart points={upper.trend} />
    <RecordingStatus errorsOnly />
  </SessionFrame>;
}
