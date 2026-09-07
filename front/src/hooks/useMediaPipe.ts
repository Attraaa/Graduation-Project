import { useCallback, useEffect, useRef, useState } from 'react';
import type { Pose, Results } from '@mediapipe/pose';

export type PoseResultsCallback = (results: Results, capturedAtMs: number) => void;
type PoseConstructor = typeof Pose;
const scriptLoads = new Map<string, Promise<void>>();
// A React remount creates a new controller before the old WASM teardown may finish.
let poseCleanup = Promise.resolve();

async function loadPoseConstructor(): Promise<PoseConstructor> {
  const src = new URL('mediapipe/pose/pose.js', document.baseURI).href;
  let loading = scriptLoads.get(src);
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        scriptLoads.delete(src);
        reject(new Error('로컬 자세 모델을 불러오지 못했습니다. 설치 파일을 확인해 주세요.'));
      };
      document.head.appendChild(script);
    });
    scriptLoads.set(src, loading);
  }
  await loading;
  const constructor = (window as Window & { Pose?: PoseConstructor }).Pose;
  if (!constructor) throw new Error('자세 분석 모듈을 초기화하지 못했습니다.');
  return constructor;
}

interface PoseRun {
  pose: Pose;
  pending: Promise<void> | null;
  frameRequest: number | null;
  processing: boolean;
  lastVideoTime: number;
  capturedAtMs: number;
  removeAbortListener: () => void;
}

/** Own async initialization, one in-flight frame, and teardown independently of React renders. */
export function createMediaPipeController(
  events: { onError: (message: string | null) => void; onLoaded: (loaded: boolean) => void },
  loadConstructor: () => Promise<PoseConstructor> = loadPoseConstructor,
) {
  let generation = 0;
  let active: PoseRun | null = null;

  const dispose = () => {
    const run = active;
    if (!run) return poseCleanup;
    active = null;
    run.processing = false;
    run.removeAbortListener();
    if (run.frameRequest !== null) cancelAnimationFrame(run.frameRequest);
    // WASM must not be closed while initialize/send still owns its buffers.
    const pending = run.pending ?? Promise.resolve();
    poseCleanup = Promise.all([poseCleanup, pending.catch(() => undefined)])
      .then(() => run.pose.close())
      .catch(error => events.onError(error instanceof Error ? error.message : String(error)));
    return poseCleanup;
  };

  const stopProcessing = () => {
    generation += 1;
    events.onLoaded(false);
    return dispose();
  };

  const initMediaPipe = async (onResults: PoseResultsCallback, signal?: AbortSignal) => {
    const request = ++generation;
    events.onError(null);
    events.onLoaded(false);
    await dispose();
    if (signal?.aborted || request !== generation) return null;
    try {
      const Constructor = await loadConstructor();
      if (signal?.aborted || request !== generation) return null;
      const assetRoot = new URL('mediapipe/pose/', document.baseURI);
      const run: PoseRun = {
        pose: new Constructor({ locateFile: file => new URL(file, assetRoot).href }),
        pending: null, frameRequest: null, processing: false, lastVideoTime: -1,
        capturedAtMs: 0, removeAbortListener: () => undefined,
      };
      active = run;
      const abort = () => { if (active === run) void stopProcessing(); };
      signal?.addEventListener('abort', abort, { once: true });
      run.removeAbortListener = () => signal?.removeEventListener('abort', abort);
      run.pose.setOptions({
        modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false,
        smoothSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      run.pose.onResults(results => {
        if (active === run && run.processing && !signal?.aborted) onResults(results, run.capturedAtMs);
      });
      run.pending = run.pose.initialize();
      await run.pending;
      run.pending = null;
      if (active !== run || request !== generation || signal?.aborted) return null;
      events.onError(null);
      events.onLoaded(true);
      return run.pose;
    } catch (error) {
      if (request === generation) {
        events.onError(error instanceof Error ? error.message : String(error));
        await stopProcessing();
      }
      return null;
    }
  };

  const startProcessing = (video: HTMLVideoElement) => {
    const run = active;
    if (!run || run.pending || run.processing) return;
    run.processing = true;
    const processFrame = async () => {
      run.frameRequest = null;
      if (active !== run || !run.processing) return;
      if (video.readyState >= 2 && !video.paused && !video.ended && video.currentTime !== run.lastVideoTime) {
        run.lastVideoTime = video.currentTime;
        // Keep capture time, not callback arrival time, for calibration and session ordering.
        run.capturedAtMs = performance.now();
        try {
          run.pending = run.pose.send({ image: video });
          await run.pending;
        } catch (error) {
          if (active === run) {
            events.onError(error instanceof Error ? error.message : String(error));
            void stopProcessing();
          }
          return;
        } finally {
          run.pending = null;
        }
      }
      if (active === run && run.processing) run.frameRequest = requestAnimationFrame(() => void processFrame());
    };
    void processFrame();
  };

  return { initMediaPipe, startProcessing, stopProcessing };
}

export const useMediaPipe = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controller = useRef<ReturnType<typeof createMediaPipeController> | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  useEffect(() => {
    let mounted = true;
    const instance = createMediaPipeController({
      onError: message => { if (mounted) setAiError(message); },
      onLoaded: loaded => { if (mounted) setIsLoaded(loaded); },
    });
    controller.current = instance;
    return () => { mounted = false; controller.current = null; void instance.stopProcessing(); };
  }, []);
  const initMediaPipe = useCallback((onResults: PoseResultsCallback, signal?: AbortSignal) =>
    controller.current?.initMediaPipe(onResults, signal) ?? Promise.resolve(null), []);
  const startProcessing = useCallback((video: HTMLVideoElement) => controller.current?.startProcessing(video), []);
  const stopProcessing = useCallback(() => controller.current?.stopProcessing() ?? Promise.resolve(), []);
  return { canvasRef, initMediaPipe, startProcessing, stopProcessing, aiError, isLoaded };
};
