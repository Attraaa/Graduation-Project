import { useCallback, useEffect, useRef } from 'react';
import { AlertCircle, CameraOff } from 'lucide-react';
import { useWebcam } from '../hooks/useWebcam';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { advanceCalibration, createCalibration, extractFrontalMeasurement } from '../features/posture/calibration';
import type { CalibrationReason, FrontalMetrics } from '../features/posture/calibration';

export interface MonitorSnapshot {
  phase: 'loading' | 'calibrating' | 'observing' | 'unavailable' | 'error';
  progress: number;
  reason: CalibrationReason | null;
  observedSeconds: number;
  delta: FrontalMetrics | null;
}

interface PostureMonitorProps {
  isRunning: boolean;
  deviceId: string;
  onUpdate: (snapshot: MonitorSnapshot) => void;
}

const PostureMonitor = ({ isRunning, deviceId, onUpdate }: PostureMonitorProps) => {
  const latest = useRef<MonitorSnapshot>({ phase: 'loading', progress: 0, reason: null, observedSeconds: 0, delta: null });
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
    let lastValidAt: number | null = null;
    let observedSeconds = 0;
    let removeTrackListener = () => {};
    let watchdog: ReturnType<typeof setInterval> | undefined;
    let lastFrameAt: number | null = null;
    const setup = async () => {
      const stream = await startWebcam(deviceId || undefined);
      if (abort.signal.aborted) return;
      if (!stream) {
        publish({ phase: 'error', progress: 0, reason: null, observedSeconds: 0, delta: null });
        return;
      }
      const track = stream.getVideoTracks()[0];
      const ended = () => {
        if (abort.signal.aborted) return;
        publish({ ...latest.current, phase: 'error', reason: 'interrupted', delta: null });
        stopWebcam();
        void stopProcessing();
      };
      track.addEventListener('ended', ended);
      removeTrackListener = () => track.removeEventListener('ended', ended);
      const pose = await initMediaPipe((results, capturedAtMs) => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (abort.signal.aborted || !video || !canvas) return;
        lastFrameAt = performance.now();
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
        const current = extractFrontalMeasurement(frame);
        let delta: FrontalMetrics | null = null;
        if (calibration.reference && current.valid) {
          // Only consecutive valid observations count; a missing camera image is not a break.
          if (lastValidAt !== null && capturedAtMs - lastValidAt <= 500) {
            observedSeconds += (capturedAtMs - lastValidAt) / 1000;
          }
          lastValidAt = capturedAtMs;
          const baseline = calibration.reference.metrics;
          delta = {
            noseOffsetShoulderWidths: current.measurement.noseOffsetShoulderWidths - baseline.noseOffsetShoulderWidths,
            noseHeightShoulderWidths: current.measurement.noseHeightShoulderWidths - baseline.noseHeightShoulderWidths,
            shoulderHeightDifferenceShoulderWidths: current.measurement.shoulderHeightDifferenceShoulderWidths - baseline.shoulderHeightDifferenceShoulderWidths,
          };
        } else {
          lastValidAt = null;
        }
        if (capturedAtMs - lastUiAt >= 200) {
          lastUiAt = capturedAtMs;
          publish({
            phase: calibration.reference ? (current.valid ? 'observing' : 'unavailable') : 'calibrating',
            progress: calibration.progress,
            reason: current.valid ? calibration.reason : current.reason,
            observedSeconds,
            delta,
          });
        }
      }, abort.signal);
      if (abort.signal.aborted) return;
      if (!pose) {
        publish({ phase: 'error', progress: 0, reason: null, observedSeconds, delta: null });
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
              lastValidAt = null;
              publish({ ...latest.current, phase: 'unavailable', reason: 'interrupted', delta: null });
            }
          }, 500);
        }
      }
    };
    void setup().catch(() => {
      if (!abort.signal.aborted) {
        publish({ phase: 'error', progress: 0, reason: null, observedSeconds, delta: null });
        stopWebcam();
        void stopProcessing();
      }
    });
    return () => {
      abort.abort();
      clearInterval(watchdog);
      removeTrackListener();
      stopWebcam();
      void stopProcessing();
    };
  }, [isRunning, deviceId, publish, videoRef, canvasRef, startWebcam, stopWebcam, initMediaPipe, startProcessing, stopProcessing]);

  useEffect(() => {
    if (isRunning && (aiError || webcamError)) {
      publish({ ...latest.current, phase: 'error', delta: null });
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
