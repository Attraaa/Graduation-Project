import { useCallback, useEffect, useRef } from 'react';
import { AlertCircle, CameraOff } from 'lucide-react';
import { useWebcam } from '../hooks/useWebcam';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { advanceCalibration, createCalibration } from '../features/posture/calibration';
import { advanceObservation, createObservation, interruptObservation } from '../features/posture/observation';
import { advanceEvaluation, createEvaluation, interruptEvaluation } from '../features/posture/evaluation';
import { createMonitorSnapshot } from '../features/posture/monitorTypes';
import type { MonitorSnapshot } from '../features/posture/monitorTypes';
import type { ScorePolicy } from '../features/posture/scoring';
import type { CaptureSink, CaptureStart } from '../features/records/recording';

interface PostureMonitorProps {
  isRunning: boolean;
  deviceId: string;
  policy: ScorePolicy;
  onUpdate: (snapshot: MonitorSnapshot) => void;
  recordCapture?: (start: CaptureStart) => CaptureSink;
}

const PostureMonitor = ({ isRunning, deviceId, policy, onUpdate, recordCapture }: PostureMonitorProps) => {
  const latest = useRef<MonitorSnapshot>(createMonitorSnapshot(policy));
  const publish = useCallback((snapshot: MonitorSnapshot) => {
    latest.current = snapshot;
    onUpdate(snapshot);
  }, [onUpdate]);
  const { videoRef, startWebcam, stopWebcam, webcamError } = useWebcam();
  const { canvasRef, initMediaPipe, startProcessing, stopProcessing, aiError, isLoaded } = useMediaPipe();

  useEffect(() => {
    if (!isRunning) return;
    const abort = new AbortController();
    let calibration = createCalibration();
    let lastUiAt = -Infinity;
    let observation = createObservation();
    let evaluation = createEvaluation(policy);
    const startMono = performance.now();
    const startEpoch = Date.now();
    const beginRecord = (at: number) => recordCapture?.({ mode: policy.mode, scorePolicyVersion: policy.version,
      habitPolicyVersion: evaluation.habitPolicyVersion, at, epoch: startEpoch + at - startMono });
    let recording = beginRecord(startMono);
    let recordedReference: string | null = null;
    let removeTrackListener = () => {};
    let watchdog: ReturnType<typeof setInterval> | undefined;
    let lastFrameAt: number | null = null;
    const setup = async () => {
      const stream = await startWebcam(deviceId || undefined);
      if (abort.signal.aborted) return;
      if (!stream) {
        publish({ ...createMonitorSnapshot(policy), phase: 'error' });
        return;
      }
      const track = stream.getVideoTracks()[0];
      const ended = () => {
        if (abort.signal.aborted) return;
        observation = interruptObservation(observation);
        evaluation = interruptEvaluation(evaluation);
        publish({ ...latest.current, phase: 'error', reason: 'interrupted', delta: null, evaluation });
        stopWebcam();
        void stopProcessing();
      };
      track.addEventListener('ended', ended);
      removeTrackListener = () => track.removeEventListener('ended', ended);
      const pose = await initMediaPipe((results, capturedAtMs) => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (abort.signal.aborted || !video || !canvas) return;
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
          sourceId: track.id, timestampMs: capturedAtMs,
        };
        calibration = advanceCalibration(calibration, frame);
        observation = advanceObservation(observation, calibration.reference, frame);
        evaluation = advanceEvaluation(evaluation, observation, policy);
        const reference = calibration.reference;
        const referenceKey = reference ? `${reference.completedAtMs}:${reference.widthPx}:${reference.heightPx}` : null;
        if (recordedReference && recordedReference !== referenceKey) {
          recording?.finish(receivedAtMs);
          recording = beginRecord(receivedAtMs);
        }
        recordedReference = referenceKey;
        recording?.sample(capturedAtMs, evaluation);
        const snapshot: MonitorSnapshot = {
          phase: calibration.reference ? (observation.delta ? 'observing' : 'unavailable') : 'calibrating',
          progress: calibration.progress,
          reason: observation.reason ?? calibration.reason,
          observedSeconds: observation.observedSeconds,
          delta: observation.delta,
          evaluation,
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
        evaluation = interruptEvaluation(evaluation);
        publish({ phase: 'error', progress: 0, reason: null, observedSeconds: observation.observedSeconds, delta: null, evaluation });
        stopWebcam();
        return;
      }
      const video = videoRef.current;
      if (video) {
        await video.play();
        if (!abort.signal.aborted) {
          lastFrameAt = performance.now();
          startProcessing(video);
          watchdog = setInterval(() => {
            if (!abort.signal.aborted && lastFrameAt !== null && performance.now() - lastFrameAt > 1500 && latest.current.phase !== 'error') {
              observation = interruptObservation(observation);
              evaluation = interruptEvaluation(evaluation);
              publish({ ...latest.current, phase: 'unavailable', reason: 'interrupted', delta: null, evaluation });
            }
          }, 500);
        }
      }
    };
    void setup().catch(() => {
      if (!abort.signal.aborted) {
        evaluation = interruptEvaluation(evaluation);
        publish({ phase: 'error', progress: 0, reason: null, observedSeconds: observation.observedSeconds, delta: null, evaluation });
        stopWebcam();
        void stopProcessing();
      }
    });
    return () => {
      abort.abort();
      recording?.finish(performance.now());
      clearInterval(watchdog);
      removeTrackListener();
      stopWebcam();
      void stopProcessing();
    };
  }, [isRunning, deviceId, policy, publish, videoRef, canvasRef, startWebcam, stopWebcam, initMediaPipe, startProcessing, stopProcessing, recordCapture]);

  useEffect(() => {
    // Flush the last computed interval on stop, but never publish from an old keyed session's cleanup.
    if (!isRunning && latest.current.phase !== 'loading') {
      publish({ ...latest.current, delta: null,
        evaluation: { ...latest.current.evaluation, currentScore: null, currentDeviation: null, continuousMs: 0, deviationState: 'unknown' } });
    }
  }, [isRunning, publish]);

  useEffect(() => {
    if (isRunning && (aiError || webcamError)) {
      publish({ ...latest.current, phase: 'error', delta: null,
        evaluation: { ...latest.current.evaluation, currentScore: null, currentDeviation: null, continuousMs: 0, deviationState: 'unknown' } });
      stopWebcam();
      void stopProcessing();
    }
  }, [isRunning, aiError, webcamError, publish, stopWebcam, stopProcessing]);

  const error = webcamError || aiError;
  return (
    <div className="relative min-h-[260px] flex-1 overflow-hidden rounded-2xl bg-slate-950">
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full scale-x-[-1] object-contain" />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full scale-x-[-1] object-contain" />
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
