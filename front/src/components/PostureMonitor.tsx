import { useCallback, useEffect, useRef } from 'react';
import { AlertCircle, CameraOff } from 'lucide-react';
import { useWebcam } from '../hooks/useWebcam';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { advanceCalibration, createCalibration } from '../features/posture/calibration';
import { advanceObservation, createObservation, interruptObservation } from '../features/posture/observation';
import { advanceEvaluation, createEvaluation, HABIT_POLICY, interruptEvaluation, type HabitPolicy } from '../features/posture/evaluation';
import { createMonitorSnapshot } from '../features/posture/monitorTypes';
import type { MonitorSnapshot } from '../features/posture/monitorTypes';
import { NECK_ONE_EURO, neckDeviation, neckScore, turtleScorePolicy } from '../features/posture/modes/turtle';
import { balanceAngles, balanceDeviation, balancePolicy, balanceReference, balanceScore, balanceTiltDeg } from '../features/posture/modes/balance';
import type { BalanceReference } from '../features/posture/modes/balance';
import { advanceNeckFlow, breakNeckClock, createOneEuro, finishNeckFlow, NECK_FLOW, neckSecondsLeft, referenceFailure, startNeckClock, startNeckFlow, tickNeckClock } from '../features/posture/e19/flow';
import type { NeckFlow } from '../features/posture/e19/flow';
import { neckFrame } from '../features/posture/e19/frame';
import type { FaceBuffer } from '../features/posture/e19/frame';
import type { NeckFrame, NeckModel } from '../features/posture/e19/model';
import { createPostureScoreTimeline } from '../features/posture/scoreTimeline';
import { beginPostureTimeline } from '../features/records/postureTimelineRecording';
import type { CaptureSink, CaptureStart } from '../features/records/recording';
import { useCameraSettings } from '../features/camera/context';

interface PostureMonitorProps {
  isRunning: boolean;
  paused?: boolean;
  referenceRequest?: number;
  deviceId: string;
  onUpdate: (snapshot: MonitorSnapshot) => void;
  recordCapture?: (start: CaptureStart) => CaptureSink;
  /** "좌우 균형 민감도" from Settings; fixed for the whole run. */
  balanceSensitivity?: number;
  /** "기준에서 벗어남" rule: the upper-body alert setting "N점 이하 N초" read at start; fixed for the whole run. */
  habitRule?: HabitPolicy;
  /** Latest FaceLandmarker results of the same transformed canvas (EyeMonitor), paired with each pose frame for E19. */
  faces?: FaceBuffer;
}

const PostureMonitor = ({ isRunning, paused = false, referenceRequest = 0, deviceId, onUpdate, recordCapture, balanceSensitivity, habitRule = HABIT_POLICY, faces }: PostureMonitorProps) => {
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
    const habit = habitRule;
    const balanceRule = balancePolicy(balanceSensitivity);
    let neck = createEvaluation(turtleScorePolicy, habit);
    let balance = createEvaluation(balanceRule, habit);
    // 좌우 균형: 보정 5초에서 잡은 고개·어깨선 기준, 관찰 시계, 목과 같은 One Euro 필터.
    let balanceRef: BalanceReference | null = null;
    let balanceClock = startNeckClock();
    const balanceFilter = createOneEuro(NECK_ONE_EURO.minCutoff, NECK_ONE_EURO.beta, NECK_ONE_EURO.dCutoff);
    const startMono = performance.now();
    const startEpoch = Date.now();
    const beginRecord = (at: number) => {
      const sessionId = crypto.randomUUID();
      const epoch = startEpoch + at - startMono;
      const local = beginPostureTimeline({ id: sessionId, startedAt: epoch,
        scorePolicyVersions: { neck: turtleScorePolicy.version, shoulder: balanceRule.version }, habitPolicyVersion: neck.habitPolicyVersion });
      const timeline = createPostureScoreTimeline(at, points => local.append(points));
      local.onStop(time => timeline.finish(time));
      return [turtleScorePolicy, balanceRule].map(policy => {
        const remote = recordCapture?.({ id: `${sessionId}:${policy.mode}`, mode: policy.mode, scorePolicyVersion: policy.version,
          habitPolicyVersion: neck.habitPolicyVersion, at, epoch });
        return {
          sample(time: number, value: Parameters<CaptureSink['sample']>[1]) {
            timeline.sample(policy.mode === 'balance' ? 'shoulder' : 'neck', time, value);
            remote?.sample(time, value);
          },
          finish(time: number) {
            if (policy.mode === 'balance') {
              timeline.finish(time);
              local.finish(epoch + time - at);
            }
            remote?.finish(time);
          },
        };
      });
    };
    let recording = beginRecord(startMono);
    let recordedReference: string | null = null;
    let removeTrackListener = () => {};
    let watchdog: ReturnType<typeof setInterval> | undefined;
    let lastFrameAt: number | null = null;
    let capturedGeneration = 0;
    let capturedVideoTime = -1;
    let resumeAt = 0;
    // E19: 3초 준비 → 5초 기록 → 보정(실패하면 이유 안내 뒤 다시). null이면 다음 프레임에서 새로 시작합니다.
    let model: NeckModel | null = null;
    let flow: NeckFlow | null = null;
    let flowToken = 0, calibrating = false, inferring = false;
    let lastInferAt = -Infinity, neckInterruptedAt = -Infinity;
    let neckClock = startNeckClock();
    const loadFilter = createOneEuro(NECK_ONE_EURO.minCutoff, NECK_ONE_EURO.beta, NECK_ONE_EURO.dCutoff);
    const restartNeck = () => {
      flow = null; flowToken++; model?.clear(); calibration = createCalibration();
      loadFilter.reset(); lastInferAt = -Infinity; neckClock = startNeckClock();
      balanceRef = null; balanceFilter.reset(); balanceClock = startNeckClock();
    };
    // Older E19 results (still running) must not overwrite a later interruption.
    const interruptNeck = (at: number) => { neckInterruptedAt = at; neckClock = breakNeckClock(neckClock); neck = interruptEvaluation(neck); };
    const interruptBalance = () => { balanceClock = breakNeckClock(balanceClock); balance = interruptEvaluation(balance); };
    const fail = () => {
      if (abort.signal.aborted) return;
      interruptNeck(performance.now());
      interruptBalance();
      publish({ ...createMonitorSnapshot(), phase: 'error', observedSeconds: observation.observedSeconds, neck, balance });
      stopWebcam();
      detach();
      void stopProcessing();
    };
    interrupt.current = () => {
      if (flow?.step !== 'ready') restartNeck();
      resumeAt = performance.now();
      observation = interruptObservation(observation);
      interruptNeck(resumeAt);
      interruptBalance();
      // Record the continuity boundary, without displaying a new value during pause.
      recording[0]?.sample(resumeAt, neck);
      recording[1]?.sample(resumeAt, balance);
    };
    recollect.current = () => {
      const at = performance.now();
      recording.forEach(sink => sink?.finish(at));
      recording = beginRecord(at); recordedReference = null;
      restartNeck(); observation = createObservation();
      neck = createEvaluation(turtleScorePolicy, habit); balance = createEvaluation(balanceRule, habit);
      resumeAt = at; neckInterruptedAt = at;
      publish({ ...createMonitorSnapshot(), phase: 'calibrating' });
    };
    const calibrate = (frames: readonly NeckFrame[]) => {
      // The pose reference (calibration.ts) must come from the same 5 s; otherwise show why and start again.
      const token = flowToken, reference = calibration.reference;
      calibrating = true;
      const result = reference ? model!.calibrate(frames) : Promise.resolve({ ok: false as const, reason: referenceFailure(calibration.reason) });
      void result.then(info => {
        if (abort.signal.aborted || token !== flowToken) return;
        flow = finishNeckFlow(performance.now(), info);
        if (info.ok) { loadFilter.reset(); balanceRef = balanceReference(frames); balanceFilter.reset(); balanceClock = startNeckClock(); }
        else calibration = createCalibration();
      }, fail).finally(() => { calibrating = false; });
    };
    const inferNeck = (input: NeckFrame, at: number) => {
      const token = flowToken;
      inferring = true; lastInferAt = at;
      void model!.infer(input).then(result => {
        if (abort.signal.aborted || token !== flowToken || at <= neckInterruptedAt) return;
        if (!result.measuring) interruptNeck(at);
        else {
          neckClock = tickNeckClock(neckClock, at);
          const score = neckScore(loadFilter.filter(result.scoreLoad, at));
          neck = advanceEvaluation(neck, { observedSeconds: neckClock.seconds }, turtleScorePolicy, habit, { score, deviation: neckDeviation(score) });
        }
        recording[0]?.sample(at, neck);
      }, fail).finally(() => { inferring = false; });
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
        interruptNeck(performance.now());
        interruptBalance();
        publish({ ...latest.current, phase: 'error', reason: 'interrupted', delta: null, neck, balance });
        stopWebcam();
        detach();
        void stopProcessing();
      };
      track.addEventListener('ended', ended);
      removeTrackListener = () => track.removeEventListener('ended', ended);
      const loading = import('../features/posture/e19/load').then(module => module.loadNeckModel());
      loading.catch(() => {}); // awaited below; the rejection reaches setup's error path there
      const pose = await initMediaPipe((results, capturedAtMs) => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (abort.signal.aborted || !model || pausedRef.current || capturedAtMs <= resumeAt || !video || !canvas || capturedGeneration !== runtime.current.generation) return;
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
        const input = neckFrame(capturedAtMs, results.poseLandmarks, faces?.match(capturedAtMs, capturedVideoTime) ?? null, video.videoWidth, video.videoHeight);
        const collectMs = model.config.calibration.window_sec * 1000;
        // A new camera identity or image size invalidates the reference, as before: calibrate again.
        const held = calibration.reference;
        if (flow?.step === 'ready' && held && (held.sourceId !== frame.sourceId || held.widthPx !== frame.widthPx || held.heightPx !== frame.heightPx)) restartNeck();
        if (flow?.step !== 'ready') {
          // Count the 3 s prep from when results arrive: the first MediaPipe frame can take seconds to warm up.
          flow = advanceNeckFlow(flow ?? startNeckFlow(receivedAtMs), capturedAtMs, input, collectMs);
          if (flow.step === 'collect') calibration = advanceCalibration(calibration, frame);
          else if (flow.step === 'prep') calibration = createCalibration();
          if (flow.step === 'computing' && !calibrating) calibrate(flow.frames);
        }
        const ready = flow!.step === 'ready';
        const reference = ready ? calibration.reference : null;
        observation = advanceObservation(observation, reference, frame);
        const referenceKey = reference ? `${reference.completedAtMs}:${reference.widthPx}:${reference.heightPx}` : null;
        if (recordedReference && recordedReference !== referenceKey) {
          recording.forEach(sink => sink?.finish(capturedAtMs));
          recording = beginRecord(capturedAtMs);
          neck = createEvaluation(turtleScorePolicy, habit);
          balance = createEvaluation(balanceRule, habit);
          neckInterruptedAt = capturedAtMs; neckClock = startNeckClock(); balanceClock = startNeckClock();
        }
        recordedReference = referenceKey;
        // Balance: every pose frame once the reference is set, from the same frame's head matrix and shoulder line.
        if (ready && balanceRef) {
          const tilt = balanceTiltDeg(balanceAngles(input), balanceRef);
          if (tilt === null) interruptBalance();
          else {
            balanceClock = tickNeckClock(balanceClock, capturedAtMs);
            const score = Math.min(100, Math.max(0, 100 - balanceFilter.filter(100 - balanceScore(tilt, balanceRule), capturedAtMs)));
            balance = advanceEvaluation(balance, { observedSeconds: balanceClock.seconds }, balanceRule, habit, { score, deviation: balanceDeviation(score) });
          }
          recording[1]?.sample(capturedAtMs, balance);
        }
        // Neck: E19 about 10 times a second under its own checks only (like the research tool).
        if (ready && !inferring && capturedAtMs - lastInferAt >= NECK_FLOW.sampleMs - 5) inferNeck(input, capturedAtMs);
        const current = flow!;
        const snapshot: MonitorSnapshot = {
          // Unavailable only when neither the neck nor the balance can be measured.
          phase: ready ? (observation.delta || neck.currentScore !== null || balance.currentScore !== null ? 'observing' : 'unavailable') : 'calibrating',
          progress: current.step === 'collect' ? Math.min(1, (capturedAtMs - current.since) / collectMs) : current.step === 'computing' || ready ? 1 : 0,
          reason: observation.reason ?? calibration.reason,
          observedSeconds: observation.observedSeconds,
          delta: observation.delta,
          neck, balance,
          neckModel: { step: current.step, secondsLeft: neckSecondsLeft(current, capturedAtMs, collectMs), failure: current.failure },
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
        interruptBalance();
        publish({ ...createMonitorSnapshot(), phase: 'error', observedSeconds: observation.observedSeconds, neck, balance });
        stopWebcam();
        detach();
        return;
      }
      model = await loading;
      if (abort.signal.aborted) return;
      if (video) {
        await video.play();
        if (!abort.signal.aborted) {
          lastFrameAt = performance.now();
          startProcessing(video, () => { capturedGeneration = runtime.current.generation; capturedVideoTime = runtime.current.videoTime; return previewRef.current ?? video; }, () => !pausedRef.current);
          watchdog = setInterval(() => {
            if (!abort.signal.aborted && !pausedRef.current && lastFrameAt !== null && performance.now() - lastFrameAt > 1500 && latest.current.phase !== 'error') {
              canvasRef.current?.getContext('2d')?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
              if (flow?.step !== 'ready') restartNeck();
              observation = interruptObservation(observation);
              interruptNeck(performance.now());
              interruptBalance();
              publish({ ...latest.current, phase: 'unavailable', reason: 'interrupted', delta: null, neck, balance });
            }
          }, 500);
        }
      }
    };
    void setup().catch(fail);
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
  }, [isRunning, deviceId, publish, videoRef, canvasRef, startWebcam, stopWebcam, initMediaPipe, startProcessing, stopProcessing, recordCapture, connect, detach, runtime, balanceSensitivity, habitRule, faces]);

  useEffect(() => {
    // Flush the last computed interval on stop, but never publish from an old keyed session's cleanup.
    if (!isRunning && latest.current.phase !== 'loading') {
      publish({ ...latest.current, delta: null,
        neck: { ...latest.current.neck, currentScore: null, currentDeviation: null, continuousMs: 0, deviationState: 'unknown' },
        balance: { ...latest.current.balance, currentScore: null, currentDeviation: null, continuousMs: 0, deviationState: 'unknown' } });
    }
  }, [isRunning, publish]);

  useEffect(() => {
    if (isRunning && (aiError || webcamError)) {
      publish({ ...latest.current, phase: 'error', delta: null,
        neck: { ...latest.current.neck, currentScore: null, currentDeviation: null, continuousMs: 0, deviationState: 'unknown' },
        balance: { ...latest.current.balance, currentScore: null, currentDeviation: null, continuousMs: 0, deviationState: 'unknown' } });
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
