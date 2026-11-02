import { RotateCcw } from 'lucide-react';
import SessionFrame from '../session/SessionFrame';
import SessionActions from '../session/SessionActions';
import SessionStatus from '../session/SessionStatus';
import MonitoringPreview from '../session/MonitoringPreview';
import LiveScoreChart from '../session/LiveScoreChart';
import { useMonitoring } from '../session/monitoringContext';
import PostureMetrics from './PostureMetrics';
import RecordingStatus from '../records/RecordingStatus';
import EyeCalibrationGuide from '../eye/EyeCalibrationGuide';
import DualMonitorPanel from '../dual-monitor/DualMonitorPanel';
import ViewReferenceGuide from './ViewReferenceGuide';

export default function PostureSession() {
  const { upper } = useMonitoring();
  const { controls, snapshot } = upper;
  const watching = upper.screens.summary?.current;
  // A turned head holds the score; name the watched side monitor instead of a generic warning.
  const sideScreen = watching && watching !== 'away' && !watching.main ? watching : null;
  const sideReady = sideScreen !== null && snapshot.views.some(view => view.id === sideScreen.id && view.status === 'ready');
  return <SessionFrame modeId="upper_body" camera={upper.camera}
    subtitle="목·어깨 점수와 분당 깜빡임을 함께 확인하세요."
    actions={<>{controls.isRunning && <button type="button" disabled={controls.isPaused} onClick={upper.recalibrate} className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-bold text-heading disabled:opacity-50"><RotateCcw size={16} />기준 다시 잡기</button>}<SessionActions modeId="upper_body" /></>}>
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-heading">상체 카메라</h2><SessionStatus modeId="upper_body" /></div>
      <div className="mx-auto w-full max-w-2xl"><MonitoringPreview modeId="upper_body" /></div>
      {controls.isRunning && !controls.isPaused && snapshot.phase === 'calibrating' && <div className="rounded-xl bg-surface-muted p-3"><p className="mb-2 text-sm text-muted">얼굴과 양쪽 어깨가 보이도록 정면을 보고 기준 자세를 잠시 유지해 주세요.</p><progress aria-label="기준 자세 수집 진행률" value={snapshot.progress} max={1} className="h-2 w-full accent-primary" /></div>}
      {controls.isRunning && snapshot.phase === 'unavailable' && !controls.isPaused && <p role="status" className="text-sm text-muted">{sideScreen ? (sideReady ? `${sideScreen.label} 기준 자세를 잡을 때와 고개 방향이 많이 달라 잠시 보류합니다. 기준을 잡을 때처럼 화면 가운데를 보면 이어서 계산합니다.`
        : `${sideScreen.label}를 보는 중입니다. 이 화면의 기준 자세가 없어 정면 모니터로 돌아오면 목·어깨 점수를 이어서 계산합니다.`) : snapshot.reason === 'body-turned' ? '몸통이 옆으로 돌아가 있어 점수 계산을 잠시 멈췄습니다. 얼굴과 어깨를 정면으로 향해 주세요.' : '얼굴과 양쪽 어깨가 화면에 보이도록 정면을 향해 주세요.'}</p>}
      {controls.isRunning && snapshot.phase === 'loading' && <p role="status" className="text-sm text-muted">{snapshot.message}</p>}
      {controls.isRunning && snapshot.phase === 'error' && <p role="alert" className="text-sm text-danger">{snapshot.message || '카메라·분석 연결을 확인한 뒤 중지하고 다시 시작해 주세요.'}</p>}
      {controls.isRunning && upper.eye.phase === 'error' && <p role="alert" className="text-sm text-danger">깜빡임 분석: {upper.eye.message}</p>}
      {controls.isRunning && !controls.isPaused && upper.eye.phase === 'calibrating' && <EyeCalibrationGuide measurement={upper.eye.measurement} />}
      {controls.isRunning && !controls.isPaused && <ViewReferenceGuide collecting={snapshot.viewCalibration} onSkip={upper.skipView} />}
      {controls.isRunning && snapshot.view && <p role="status" className="text-xs text-muted">{snapshot.view.label} 기준 자세로 목·어깨 점수를 계산하고 있습니다.</p>}
      <PostureMetrics snapshot={snapshot} eye={upper.eye.measurement} isRunning={controls.isRunning} />
    </section>
    <DualMonitorPanel view={upper.screens} isRunning={controls.isRunning} isPaused={controls.isPaused} references={snapshot.views} />
    <LiveScoreChart points={upper.trend} />
    <RecordingStatus errorsOnly />
  </SessionFrame>;
}
