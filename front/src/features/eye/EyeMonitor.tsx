import { useEffect, useRef } from 'react';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { useWebcam } from '../../hooks/useWebcam';
import { createEyeMeasurement } from './measurement';
import type { EyeSnapshot } from './measurement';
import { readEyes } from './observation';
import { createEyeRunner } from './runner';
import { eyeCameraChanged, eyeStreamIssue } from './streamStatus';
import type { EyeCameraSignature } from './streamStatus';
import { initializeMediaPipe } from '../session/mediaPipeInitialization';
import { useCameraSettings } from '../camera/context';
import { imageSignature } from '../camera/profile';
import type { EyeSensitivity } from './eyePolicy';

export type EyeUpdate = { measurement: EyeSnapshot; phase: 'loading' | 'calibrating' | 'observing' | 'unavailable' | 'error'; message: string };

export default function EyeMonitor({ active, deviceId, reference, eyeReference, sensitivity, onUpdate, onSample }: {
  onSample: (at: number, snapshot: EyeSnapshot) => void;
  active: boolean; deviceId: string; reference: number; eyeReference: number; sensitivity: EyeSensitivity; onUpdate: (update: EyeUpdate) => void;
}) {
  const { videoRef, startWebcam, stopWebcam, webcamError } = useWebcam();
  const previewRef = useRef<HTMLCanvasElement>(null);
  const { connect, detach, runtime } = useCameraSettings();
  const measurement = useRef(createEyeMeasurement(sensitivity));
  const lastReference = useRef(reference);
  const lastEyeReference = useRef(eyeReference);
  const cameraSignature = useRef<EyeCameraSignature | null>(null);
  useEffect(() => {
    if (lastReference.current === reference) return;
    lastReference.current = reference;
    const snapshot = measurement.current.recalibrate();
    onSample(performance.now(), snapshot);
    onUpdate({ measurement: snapshot, phase: 'calibrating',
      message: '새 거리 기준을 수집합니다. 지금까지의 깜빡임과 휴식 기록은 유지합니다.' });
  }, [reference, onUpdate, onSample]);
  useEffect(() => {
    if (lastEyeReference.current === eyeReference) return;
    lastEyeReference.current = eyeReference;
    const snapshot = measurement.current.recalibrateEyes();
    onSample(performance.now(), snapshot);
    onUpdate({ measurement: snapshot, phase: 'calibrating',
      message: '눈과 거리 기준을 다시 수집합니다. 지금까지의 깜빡임과 휴식 기록은 유지합니다.' });
  }, [eyeReference, onUpdate, onSample]);
  useEffect(() => {
    if (!active) return;
    const engine = measurement.current;
    let cancelled = false;
    let frameId = 0;
    let lastFrameAt: number | null = null;
    let readyAt: number | null = null;
    let activeDeviceId = '';
    let cameraChanged = false;
    let lastVideoTime = -1;
    let lastPublished = 0;
    let removeTrackListener = () => {};
    const invalidate = (message: string, phase: EyeUpdate['phase'] = 'unavailable') => {
      const at = performance.now(), snapshot = engine.sample(at, null);
      onSample(at, snapshot);
      onUpdate({ measurement: snapshot, phase, message });
    };
    invalidate('얼굴 모델을 불러오고 있습니다. 처음에는 잠시 걸릴 수 있습니다.', 'loading');
    const fail = (error: unknown) => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      invalidate(error instanceof Error ? error.message : String(error), 'error');
    };
    const runner = createEyeRunner<FaceLandmarker>({
      camera: async () => {
        const stream = await startWebcam(deviceId || undefined);
        activeDeviceId = stream?.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId;
        const track = stream?.getVideoTracks()[0];
        if (track) {
          const ended = () => { if (!cancelled) { runner.stop(); fail(new Error('카메라 연결이 중단되었습니다. 다시 연결한 뒤 시작해 주세요.')); } };
          track.addEventListener('ended', ended);
          removeTrackListener = () => track.removeEventListener('ended', ended);
        }
        if (!cancelled && stream && videoRef.current && previewRef.current) await connect(videoRef.current, stream, previewRef.current);
        return stream;
      },
      stopCamera: () => { stopWebcam(); detach(); },
      model: async () => {
        const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
        const base = new URL(import.meta.env.BASE_URL, document.baseURI);
        const files = await FilesetResolver.forVisionTasks(new URL('mediapipe/face/wasm', base).href);
        return initializeMediaPipe(() => FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: new URL('models/face_landmarker.task', base).href, delegate: 'CPU' },
          runningMode: 'VIDEO', numFaces: 2, outputFaceBlendshapes: true,
          minFaceDetectionConfidence: 0.6, minFacePresenceConfidence: 0.6, minTrackingConfidence: 0.6,
        }), true);
      },
      ready: async model => {
        const video = videoRef.current;
        if (!video) throw new Error('카메라 미리보기를 찾지 못했습니다.');
        readyAt = performance.now();
        await video.play();
        if (cancelled) return;
        const process = (now: number) => {
          if (cancelled) return;
          try {
            if (!document.hidden && video.readyState >= 2 && video.currentTime !== lastVideoTime && (lastFrameAt === null || now - lastFrameAt >= 30)) {
              const signature = { deviceId: `${activeDeviceId}:${imageSignature(runtime.current.profile)}:${runtime.current.profile.resolution}:${runtime.current.profile.exposureMode}:${runtime.current.profile.exposure}`, width: video.videoWidth, height: video.videoHeight };
              if (eyeCameraChanged(cameraSignature.current, signature)) {
                engine.recalibrateEyes();
                cameraChanged = true;
              }
              cameraSignature.current = signature;
              const result = model.detectForVideo(previewRef.current ?? video, now);
              const { observation, reason } = readEyes(result, video.videoWidth, video.videoHeight);
              const current = engine.sample(now, observation);
              onSample(now, current);
              lastVideoTime = video.currentTime;
              lastFrameAt = now;
              // Analyze every available frame; render cards at most 10 times per second.
              if (now - lastPublished >= 100) {
                onUpdate({ measurement: current,
                  phase: !observation ? 'unavailable' : current.calibrated ? 'observing' : 'calibrating',
                  message: reason ?? (current.calibrated ? '개인 눈 기준으로 양쪽 눈 깜빡임과 얼굴 크기 변화를 관찰합니다.'
                    : current.calibrationPhase === 'eyes' ? `개인 눈 기준을 수집합니다. 양쪽 눈을 3번 깜빡여 주세요. 확인 ${current.calibrationBlinks}/3회`
                      : cameraChanged ? '카메라 구도가 바뀌어 눈과 거리 기준을 다시 수집합니다. 기존 횟수는 유지합니다.'
                        : '양쪽 눈을 편안하게 뜨고 3초간 정면을 유지해 주세요. 가림과 조명을 확인해 주세요.'),
                });
                lastPublished = now;
              }
            }
            frameId = requestAnimationFrame(process);
          } catch (error) { runner.stop(); fail(error); }
        };
        frameId = requestAnimationFrame(process);
      },
      error: fail,
    });
    // Clears stale indicators even if the camera freezes without an ended event.
    const watchdog = window.setInterval(() => {
      if (cancelled) return;
      const issue = eyeStreamIssue(performance.now(), readyAt, lastFrameAt, document.hidden);
      if (issue) invalidate(issue);
    }, 500);
    const onVisibility = () => { if (document.hidden && !cancelled) invalidate('다른 탭에서는 영상 관찰을 보류합니다.'); };
    document.addEventListener('visibilitychange', onVisibility);
    void runner.start();
    return () => {
      cancelled = true;
      window.clearInterval(watchdog);
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(frameId);
      removeTrackListener();
      engine.sample(performance.now(), null);
      runner.stop();
    };
  }, [active, deviceId, onUpdate, onSample, startWebcam, stopWebcam, videoRef, connect, detach, runtime]);
  return (
    <div className="relative overflow-hidden rounded-2xl bg-surface-muted">
      <video ref={videoRef} muted playsInline className="hidden" />
      <canvas ref={previewRef} aria-label="안구 모드 카메라 미리보기" className="h-[min(40vh,360px)] min-h-56 w-full object-contain" />
      {!active && <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-muted">카메라 꺼짐 · 시작하거나 휴식에서 복귀하면 연결합니다.</div>}
      {webcamError && active && <p role="alert" className="p-3 text-sm text-danger">카메라 오류: {webcamError}</p>}
    </div>
  );
}
