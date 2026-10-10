import { useCallback, useEffect, useRef } from 'react';
import { AlertCircle, CameraOff } from 'lucide-react';
import { useWebcam } from '../hooks/useWebcam';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { advanceCalibration, createCalibration } from '../features/posture/calibration';
import { advanceObservation, createObservation, interruptObservation } from '../features/posture/observation';
import { advanceEvaluation, createEvaluation, interruptEvaluation } from '../features/posture/evaluation';
import { createMonitorSnapshot } from '../features/posture/monitorTypes';
import type { MonitorSnapshot } from '../features/posture/monitorTypes';
import { turtleScorePolicy } from '../features/posture/modes/turtle';
import { shoulderScorePolicy } from '../features/posture/modes/shoulder';
import type { CaptureSink, CaptureStart } from '../features/records/recording';
import { useCameraSettings } from '../features/camera/context';

interface PostureMonitorProps {
  isRunning: boolean;
  paused?: boolean;
  referenceRequest?: number;
  deviceId: string;
  onUpdate: (snapshot: MonitorSnapshot) => void;
  recordCapture?: (start: CaptureStart) => CaptureSink;
}

const PostureMonitor = ({ isRunning, paused = false, referenceRequest = 0, deviceId, onUpdate, recordCapture }: PostureMonitorProps) => {
  const pausedRef = useRef(paused);
  const interrupt = useRef<() => void>(() => {});
  const recollect = useRef<() => void>(() => {});
  const previousReference = useRef(referenceRequest);
  useEffect(() => { pausedRef.current = paused; interrupt.current(); }, [paused]);
  useEffect(() => {
    if (previousReference.current !== referenceRequest) { previousReference.current = referenceRequest; recollect.current(); }
  }, [referenceRequest]);
  const latest = useRef<MonitorSnapshot>(createMonitorSnapshot());
  const publish = useCallback((snapshot: MonitorSnapshot) => {
    latest.current = snapshot;
    onUpdate(snapshot);
  }, [onUpdate]);
  const { videoRef, startWebcam, stopWebcam, webcamError } = useWebcam();
  const { canvasRef, initMediaPipe, startProcessing, stopProcessing, aiError, isLoaded } = useMediaPipe();
  const previewRef = useRef<HTMLCanvasElement>(null);
  const { connect, detach, runtime } = useCameraSettings();

  useEffect(() => {
    if (!isRunning) return;
    const abort = new AbortController();
    let calibration = createCalibration();
    let lastUiAt = -Infinity;
    let observation = createObservation();
    let neck = createEvaluation(turtleScorePolicy);
    let shoulder = createEvaluation(shoulderScorePolicy);
    const startMono = performance.now();
    const startEpoch = Date.now();
    const beginRecord = (at: number) => {
      const sessionId = crypto.randomUUID();
      const epoch = startEpoch + at - startMono;
      return [turtleScorePolicy, shoulderScorePolicy].map(policy => recordCapture?.({
        id: `${sessionId}:${policy.mode}`, mode: policy.mode, scorePolicyVersion: policy.version,
        habitPolicyVersion: neck.habitPolicyVersion, at, epoch,
      }));
    };
    let recording = beginRecord(startMono);
    let recordedReference: string | null = null;
    let removeTrackListener = () => {};
    let watchdog: ReturnType<typeof setInterval> | undefined;
    let lastFrameAt: number | null = null;
    let capturedGeneration = 0;
    let resumeAt = 0;
    interrupt.current = () => {
      if (!calibration.reference) calibration = createCalibration();
      observation = interruptObservation(observation);
      neck = interruptEvaluation(neck);
      shoulder = interruptEvaluation(shoulder);
      resumeAt = performance.now();
      // Record the continuity boundary, without displaying a new value during pause.
      recording[0]?.sample(resumeAt, neck);
      recording[1]?.sample(resumeAt, shoulder);
    };
    recollect.current = () => {
      const at = performance.now();
      recording.forEach(sink => sink?.finish(at));
      recording = beginRecord(at); recordedReference = null;
      calibration = createCalibration(); observation = createObservation();
      neck = createEvaluation(turtleScorePolicy); shoulder = createEvaluation(shoulderScorePolicy);
      resumeAt = at;
      publish({ ...createMonitorSnapshot(), phase: 'calibrating' });
    };
    const setup = async () => {
      const stream = await startWebcam(deviceId || undefined);
      if (abort.signal.aborted) return;
      if (!stream) {
        publish({ ...createMonitorSnapshot(), phase: 'error' });
        return;
      }
      const track = stream.getVideoTracks()[0];
      const video = videoRef.current;
      if (!video || !previewRef.current) throw new Error('카메라 미리보기를 찾지 못했습니다.');
      await connect(video, stream, previewRef.current, canvasRef.current);
      if (abort.signal.aborted) return;
      const ended = () => {
        if (abort.signal.aborted) return;
        observation = interruptObservation(observation);
        neck = interruptEvaluation(neck);
        shoulder = interruptEvaluation(shoulder);
        publish({ ...latest.current, phase: 'error', reason: 'interrupted', delta: null, neck, shoulder });
        stopWebcam();
        detach();
        void stopProcessing();
      };
      track.addEventListener('ended', ended);
      removeTrackListener = () => track.removeEventListener('ended', ended);
      const pose = await initMediaPipe((results, capturedAtMs) => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (abort.signal.aborted || pausedRef.current || capturedAtMs <= resumeAt || !video || !canvas || capturedGeneration !== runtime.current.generation) return;
        const receivedAtMs = performance.now();
        lastFrameAt = receivedAtMs;
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        const context = canvas.getContext('2d');
        if (context) {
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.strokeStyle = '#38bdf8';
          context.fillStyle = '#ffffff';
          context.lineWidth = 3;
          const landmarks = results.poseLandmarks;
          for (const [from, to] of [[11, 12], [11, 7], [12, 8]]) {
            const a = landmarks?.[from];
            const b = landmarks?.[to];
            if (!a || !b || (a.visibility ?? 0) < 0.7 || (b.visibility ?? 0) < 0.7) continue;
            context.beginPath();
            context.moveTo(a.x * canvas.width, a.y * canvas.height);
            context.lineTo(b.x * canvas.width, b.y * canvas.height);
            context.stroke();
          }
          for (const id of [0, 7, 8, 11, 12]) {
            const point = landmarks?.[id];
            if (!point || (point.visibility ?? 0) < 0.7) continue;
            context.beginPath();
            context.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, Math.PI * 2);
            context.fill();
          }
        }

        const frame = {
          landmarks: results.poseLandmarks, widthPx: video.videoWidth, heightPx: video.videoHeight,
          sourceId: `${track.id}:${capturedGeneration}`, timestampMs: capturedAtMs,
        };
        calibration = advanceCalibration(calibration, frame);
        observation = advanceObservation(observation, calibration.reference, frame);
        const reference = calibration.reference;
        const referenceKey = reference ? `${reference.completedAtMs}:${reference.widthPx}:${reference.heightPx}` : null;
        if (recordedReference && recordedReference !== referenceKey) {
          recording.forEach(sink => sink?.finish(capturedAtMs));
          recording = beginRecord(capturedAtMs);
          neck = createEvaluation(turtleScorePolicy);
          shoulder = createEvaluation(shoulderScorePolicy);
        }
        recordedReference = referenceKey;
        neck = advanceEvaluation(neck, observation, turtleScorePolicy);
        shoulder = advanceEvaluation(shoulder, observation, shoulderScorePolicy);
        recording[0]?.sample(capturedAtMs, neck);
        recording[1]?.sample(capturedAtMs, shoulder);
        const snapshot: MonitorSnapshot = {
          phase: calibration.reference ? (observation.delta ? 'observing' : 'unavailable') : 'calibrating',
          progress: calibration.progress,
          reason: observation.reason ?? calibration.reason,
          observedSeconds: observation.observedSeconds,
          delta: observation.delta,
          neck, shoulder,
        };
        if (receivedAtMs - lastUiAt >= 200 || (observation.delta === null && latest.current.delta !== null)) {
          lastUiAt = receivedAtMs;
          publish(snapshot);
        } else {
          latest.current = snapshot;
        }
      }, abort.signal);
      if (abort.signal.aborted) return;
      if (!pose) {
        neck = interruptEvaluation(neck);
        shoulder = interruptEvaluation(shoulder);
        publish({ phase: 'error', progress: 0, reason: null, observedSeconds: observation.observedSeconds, delta: null, neck, shoulder });
        stopWebcam();
        detach();
        return;
      }
      if (video) {
        await video.play();
        if (!abort.signal.aborted) {
          lastFrameAt = performance.now();
          startProcessing(video, () => { capturedGeneration = runtime.current.generation; return previewRef.current ?? video; }, () => !pausedRef.current);
          watchdog = setInterval(() => {
            if (!abort.signal.aborted && !pausedRef.current && lastFrameAt !== null && performance.now() - lastFrameAt > 1500 && latest.current.phase !== 'error') {
              canvasRef.current?.getContext('2d')?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
              observation = interruptObservation(observation);
              neck = interruptEvaluation(neck);
              shoulder = interruptEvaluation(shoulder);
              publish({ ...latest.current, phase: 'unavailable', reason: 'interrupted', delta: null, neck, shoulder });
            }
          }, 500);
        }
      }
    };
    void setup().catch(() => {
      if (!abort.signal.aborted) {
        neck = interruptEvaluation(neck);
        shoulder = interruptEvaluation(shoulder);
        publish({ phase: 'error', progress: 0, reason: null, observedSeconds: observation.observedSeconds, delta: null, neck, shoulder });
        stopWebcam();
        detach();
        void stopProcessing();
      }
    });
    return () => {
      abort.abort();
      interrupt.current = () => {};
      recollect.current = () => {};
      const finishedAt = performance.now();
      recording.forEach(sink => sink?.finish(finishedAt));
      clearInterval(watchdog);
      removeTrackListener();
      stopWebcam();
      detach();
      void stopProcessing();
    };
  }, [isRunning, deviceId, publish, videoRef, canvasRef, startWebcam, stopWebcam, initMediaPipe, startProcessing, stopProcessing, recordCapture, connect, detach, runtime]);

  useEffect(() => {
    // Flush the last computed interval on stop, but never publish from an old keyed session's cleanup.
    if (!isRunning && latest.current.phase !== 'loading') {
      publish({ ...latest.current, delta: null,
        neck: { ...latest.current.neck, currentScore: null, currentDeviation: null, continuousMs: 0, deviationState: 'unknown', protection: 'none' },
        shoulder: { ...latest.current.shoulder, currentScore: null, currentDeviation: null, continuousMs: 0, deviationState: 'unknown', protection: 'none' } });
    }
  }, [isRunning, publish]);

  useEffect(() => {
    if (isRunning && (aiError || webcamError)) {
      publish({ ...latest.current, phase: 'error', delta: null,
        neck: { ...latest.current.neck, currentScore: null, currentDeviation: null, continuousMs: 0, deviationState: 'unknown', protection: 'none' },
        shoulder: { ...latest.current.shoulder, currentScore: null, currentDeviation: null, continuousMs: 0, deviationState: 'unknown', protection: 'none' } });
      stopWebcam();
      detach();
      void stopProcessing();
    }
  }, [isRunning, aiError, webcamError, publish, stopWebcam, stopProcessing, detach]);

  const error = webcamError || aiError;
  return (
    <div className="relative min-h-[260px] flex-1 overflow-hidden rounded-2xl bg-slate-950">
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />
      <canvas ref={previewRef} className="absolute inset-0 h-full w-full object-contain" />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
      {!isRunning && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-slate-300">
          <CameraOff size={32} />
          <p>시작하면 카메라를 켜고 기준 자세를 수집합니다.</p>
          <p className="text-sm">측정을 중지하면 카메라도 꺼집니다.</p>
        </div>
      )}
      {isRunning && !isLoaded && !error && <p className="absolute inset-x-0 bottom-5 text-center text-white">카메라와 분석 모델을 준비하고 있습니다.</p>}
      {isRunning && error && (
        <div role="alert" className="absolute inset-x-4 top-4 flex gap-3 rounded-xl bg-red-50 p-4 text-red-800">
          <AlertCircle className="shrink-0" size={22} /><p>{error}</p>
        </div>
      )}
    </div>
  );
};

export default PostureMonitor;
