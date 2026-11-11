// Development-only integration harness. Blank canvas stream; no real camera or server.
import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CameraProvider from '../src/features/camera/CameraProvider';
import PostureMonitor from '../src/components/PostureMonitor';
import PostureMetrics from '../src/features/posture/PostureMetrics';
import ScoreExplanation from '../src/features/posture/ScoreExplanation';
import { createMonitorSnapshot } from '../src/features/posture/monitorTypes';
import type { CaptureStart, CaptureSink } from '../src/features/records/recording';
import '../src/index.css';

const captures: { start: CaptureStart; samples: number; finished: boolean }[] = [];
let activeTracks = 0;
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
  const stream = canvas.captureStream(30), track = stream.getVideoTracks()[0];
  activeTracks++;
  track.getSettings = () => ({ deviceId: 'posture-test-canvas', width: 640, height: 480 });
  const timer = window.setInterval(() => {
    if (track.readyState === 'ended') { clearInterval(timer); activeTracks--; return; }
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#162438'; context.fillRect(0, 0, 640, 480);
    context.fillStyle = 'white'; context.font = '20px sans-serif'; context.fillText('SIMULATED LANDMARKS · NO CAMERA', 80, 230);
  }, 33);
  return stream;
} });
function App() {
  const [running, setRunning] = useState(false), [paused, setPaused] = useState(false), [reference, setReference] = useState(0);
  const [snapshot, setSnapshot] = useState(createMonitorSnapshot);
  const recordCapture = useCallback((start: CaptureStart): CaptureSink => {
    const capture = { start, samples: 0, finished: false }; captures.push(capture);
    return { sample: () => { capture.samples++; }, finish: () => { capture.finished = true; } };
  }, []);
  return <main className="mx-auto max-w-3xl space-y-4 p-6">
    <h1>상체 검증 화면 · 가상 좌표</h1>
    <div className="flex gap-4"><button onClick={() => setRunning(true)}>시작</button><button onClick={() => setPaused(value => !value)}>일시정지/재개</button><button onClick={() => setReference(value => value + 1)}>기준 다시 잡기</button><button onClick={() => { setRunning(false); setPaused(false); }}>중지</button></div>
    <CameraProvider modeId="upper_body" deviceId="posture-test-canvas" cameraLabel="검증 영상" paused={paused}>
      <PostureMonitor isRunning={running} deviceId="posture-test-canvas" paused={paused} referenceRequest={reference} onUpdate={setSnapshot} recordCapture={recordCapture} />
    </CameraProvider>
    <PostureMetrics snapshot={snapshot} isRunning={running} />
    <ScoreExplanation snapshot={snapshot} isRunning={running} paused={paused} />
    <pre data-testid="snapshot" className="text-xs" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify({ phase: snapshot.phase, message: snapshot.message, reason: snapshot.reason,
      neck: snapshot.neck.currentScore, shoulder: snapshot.shoulder.currentScore, observed: snapshot.observedSeconds, captures, activeTracks })}</pre>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
