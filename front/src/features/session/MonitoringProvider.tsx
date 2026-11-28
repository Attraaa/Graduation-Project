import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw } from 'lucide-react';
import CameraProvider from '../camera/CameraProvider';
import { CameraContext, useCameraSettings, type CameraContextValue } from '../camera/context';
import CameraSettingsPanel from '../camera/CameraSettingsPanel';
import { useCameraWindow } from '../camera/useCameraWindow';
import PostureMonitor from '../../components/PostureMonitor';
import KeyboardMonitor from '../../components/KeyboardMonitor';
import EyeMonitor, { type EyeUpdate } from '../eye/EyeMonitor';
import { emptyEyeSnapshot, type EyeSnapshot } from '../eye/measurement';
import { beginEyeRecording, type EyeSink } from '../eye/recording';
import { beginPostureRecording } from '../records/recording';
import { UPPER_MEASUREMENT } from '../settings/preferences';
import { readNotificationPreferences } from '../notifications/preferences';
import { habitRule } from '../posture/evaluation';
import { createMonitorSnapshot, type MonitorSnapshot } from '../posture/monitorTypes';
import { createFaceBuffer, type FaceBuffer } from '../posture/e19/frame';
import { initialKeyboardSnapshot, type KeyboardMonitorSnapshot } from '../keyboard/monitorTypes';
import { liveAverage, livePressScore } from '../keyboard/liveScore';
import { useSessionControls } from './useSessionControls';
import { MonitoringContext, type MonitoringState } from './monitoringContext';
import type { MonitoringMode } from './modes';
import { appendTrend, type TrendPoint } from './trend';
import { usePostureNotifications } from '../notifications/usePostureNotifications';
import { useActivityNotifications } from '../notifications/useActivityNotifications';
import MonitoringDesktopBridge from '../overlay/MonitoringDesktopBridge';
import { systemIssue } from '../notifications/issues';
import { sessionLabel } from './presentation';
import { cameraEyeId } from './cameraRecordId';
import { recordingDeletionPending } from '../records/deletion';

const initialEye = (): EyeUpdate => ({ measurement: emptyEyeSnapshot(), phase: 'loading', message: '' });
// The alert rule also counts 기준에서 벗어남. Capture it when each upper-body run starts.
const readSensitivity = () => {
  const alert = readNotificationPreferences();
  return { balance: UPPER_MEASUREMENT.balanceSensitivity, eye: UPPER_MEASUREMENT.eyeSensitivity, habit: habitRule(alert.scoreThreshold, alert.postureSeconds) };
};
export default function MonitoringProvider({ children }: { children: ReactNode }) {
  const upper = useSessionControls('upper_body');
  const keyboard = useSessionControls('keyboard');
  const { fail: failUpper, getState: upperState } = upper;
  const { fail: failKeyboard, getState: keyboardState } = keyboard;
  const [sensitivity, setSensitivity] = useState(readSensitivity);
  const [snapshot, setSnapshot] = useState(createMonitorSnapshot);
  const [eye, setEye] = useState(initialEye);
  const [keys, setKeys] = useState(initialKeyboardSnapshot);
  const [remap, setRemap] = useState(0);
  const [referenceRequest, setReferenceRequest] = useState(0);
  const [eyeRetryRequest, setEyeRetryRequest] = useState(0);
  const [cameraRun, setCameraRun] = useState('');
  // Face results of the shared upper-body canvas (EyeMonitor) for the neck model in PostureMonitor.
  const [faces] = useState(createFaceBuffer);
  usePostureNotifications(snapshot, upper.isRunning && !upper.isPaused, upper.run, referenceRequest);
  const { observeKeyboard, observeEye } = useActivityNotifications(upperState, keyboardState, referenceRequest);
  const [upperTrend, setUpperTrend] = useState<TrendPoint[]>([]);
  const [keyboardTrend, setKeyboardTrend] = useState<TrendPoint[]>([]);
  const eyeSink = useRef<EyeSink | null>(null);
  const lastPress = useRef<number | null>(null);
  const lastInputAt = useRef(0);
  const { portal, open, close, error } = useCameraWindow();
  const [configMode, setConfigMode] = useState<MonitoringMode>('upper_body');
  const openCamera = useCallback((mode: string, ratio: number) => { setConfigMode(mode === 'keyboard' ? 'keyboard' : 'upper_body'); open(ratio); }, [open]);
  const onPosture = useCallback((value: MonitorSnapshot) => {
    setSnapshot(value);
    const current = upperState();
    if (value.phase === 'error' && current.running) {
      systemIssue('upper', String(current.run), 'upper-analysis'); failUpper(); eyeSink.current?.finish();
    }
    setUpperTrend(points => appendTrend(points, { at: performance.now(), neck: value.neck.currentScore, balance: value.balance.currentScore, keyboard: null }));
  }, [failUpper, upperState]);
  const onKeyboard = useCallback((value: KeyboardMonitorSnapshot) => {
    observeKeyboard(value);
    setKeys(value);
    const current = keyboardState();
    if (value.phase === 'error' && current.running) { systemIssue('keyboard', String(current.run), 'keyboard-analysis'); failKeyboard(); }
    // A newly judged press plots the average of the last 50 judged presses; no idle synthetic scores.
    if (value.latest && value.latest.id !== lastPress.current) {
      lastPress.current = value.latest.id;
      lastInputAt.current = performance.now();
      if (livePressScore(value.latest) !== null) setKeyboardTrend(points => appendTrend(points, { at: performance.now(), neck: null, balance: null, keyboard: liveAverage(value.scores) }));
    }
  }, [failKeyboard, keyboardState, observeKeyboard]);
  const onEyeSample = useCallback((at: number, value: EyeSnapshot) => eyeSink.current?.sample(at, value), []);
  const onEyeUpdate = useCallback((value: EyeUpdate) => {
    observeEye(value);
    setEye(value);
    // A retry can resume this eye recording while the upper-body session stays open.
    const state = upperState();
    if (value.phase === 'error' && state.running) systemIssue('eye', String(state.run), 'eye-analysis');
  }, [upperState, observeEye]);
  const startUpper = () => {
    if (upper.getState().running || recordingDeletionPending()) return;
    for (const key of ['upper', 'eye', 'tracking']) systemIssue(key, '', null);
    const chosen = readSensitivity(); setSensitivity(chosen);
    const run = crypto.randomUUID();
    setCameraRun(run);
    eyeSink.current?.finish(); eyeSink.current = beginEyeRecording(chosen.eye, cameraEyeId(run));
    faces.clear();
    setEye(initialEye()); setSnapshot(createMonitorSnapshot()); setUpperTrend([]);
    upper.start();
  };
  const startKeyboard = () => { if (keyboard.getState().running || recordingDeletionPending()) return; systemIssue('keyboard', '', null); lastPress.current = null; setKeys(initialKeyboardSnapshot); setKeyboardTrend([]); keyboard.start(); };
  const recalibrate = () => {
    const { running, paused } = upper.getState();
    if (!running || paused) return;
    faces.clear();
    setUpperTrend([]);
    setReferenceRequest(value => value + 1);
    if (eye.phase === 'error') {
      systemIssue('eye', '', null);
      setEyeRetryRequest(value => value + 1);
    }
  };
  const remapKeyboard = () => {
    const { running, paused } = keyboard.getState();
    if (!running || paused) return;
    setKeyboardTrend([]);
    setRemap(value => value + 1);
  };
  const trackingIncident = useRef<string | null>(null);
  useEffect(() => {
    if (!upper.isRunning || upper.isPaused) { trackingIncident.current = null; systemIssue('tracking', '', null); return; }
    if (snapshot.phase === 'unavailable') {
      let refresh: ReturnType<typeof setInterval> | undefined;
      const timer = window.setTimeout(() => {
        trackingIncident.current ??= crypto.randomUUID();
        const publish = () => { if (trackingIncident.current) systemIssue('tracking', trackingIncident.current, 'tracking'); };
        publish(); refresh = window.setInterval(publish, 1000);
      }, 10_000);
      return () => { window.clearTimeout(timer); window.clearInterval(refresh); };
    }
    if (snapshot.phase === 'observing') {
      if (trackingIncident.current) systemIssue('tracking', trackingIncident.current, 'tracking', false);
      const timer = window.setTimeout(() => { trackingIncident.current = null; systemIssue('tracking', '', null); }, 3000);
      return () => window.clearTimeout(timer);
    }
    trackingIncident.current = null; systemIssue('tracking', '', null);
  }, [snapshot.phase, upper.isRunning, upper.isPaused, upper.run]);
  // A failed automatic keyboard recognition also goes to Windows while Moti is not in front, until the area is fitted.
  const areaIncident = useRef<string | null>(null);
  useEffect(() => {
    if (!keyboard.isRunning || keyboard.isPaused || keys.recognition !== 'waiting') {
      if (areaIncident.current) { areaIncident.current = null; systemIssue('keyboard-area', '', null); }
      return;
    }
    const incident = areaIncident.current ??= crypto.randomUUID();
    const publish = () => systemIssue('keyboard-area', incident, 'keyboard-area');
    publish();
    const timer = window.setInterval(publish, 1000);
    return () => window.clearInterval(timer);
  }, [keys.recognition, keyboard.isRunning, keyboard.isPaused]);
  useEffect(() => { if (!upper.isRunning) { eyeSink.current?.finish(); eyeSink.current = null; } }, [upper.isRunning]);
  useEffect(() => () => eyeSink.current?.finish(), []);
  useEffect(() => {
    if (!keyboard.isRunning || keyboard.isPaused) return;
    const timer = window.setInterval(() => {
      const at = performance.now();
      if (at - lastInputAt.current > 1500) setKeyboardTrend(points => points.length ? appendTrend(points, { at, neck: null, balance: null, keyboard: null }) : points);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [keyboard.isRunning, keyboard.isPaused]);
  const stopUpper = upper.stop, stopKeyboard = keyboard.stop;
  useEffect(() => window.motiKeyboard?.onHalt(() => { stopUpper(); stopKeyboard(); close(); }), [stopUpper, stopKeyboard, close]);
  useEffect(() => {
    const stop = () => { stopUpper(); stopKeyboard(); eyeSink.current?.finish(); };
    window.addEventListener('moti-stop-measurement', stop);
    return () => window.removeEventListener('moti-stop-measurement', stop);
  }, [stopUpper, stopKeyboard]);
  const base: BaseState = {
    upper: { controls: { ...upper, pause: () => { upper.pause(); setUpperTrend(points => appendTrend(points, { at: performance.now(), neck: null, balance: null, keyboard: null })); } }, snapshot, eye, trend: upperTrend, start: startUpper, recalibrate },
    keyboard: { controls: { ...keyboard, pause: () => { keyboard.pause(); setKeyboardTrend(points => appendTrend(points, { at: performance.now(), neck: null, balance: null, keyboard: null })); } }, snapshot: keys, trend: keyboardTrend, start: startKeyboard, remap: remapKeyboard },
  };
  return <CameraProvider modeId="upper_body" deviceId={upper.deviceId} cameraLabel={deviceLabel(upper)} paused={upper.isPaused} onOpen={openCamera}>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <KeyboardCamera base={base} openCamera={openCamera} portal={portal} configMode={configMode} setConfigMode={setConfigMode}
      onPosture={onPosture} onKeyboard={onKeyboard} onEyeUpdate={onEyeUpdate} onEyeSample={onEyeSample}
      remapRequest={remap} referenceRequest={referenceRequest} eyeRetryRequest={eyeRetryRequest} cameraRun={cameraRun}
      sensitivity={sensitivity} faces={faces}>{children}</KeyboardCamera>
  </CameraProvider>;
}

type BaseState = { upper: Omit<MonitoringState['upper'], 'camera'>; keyboard: Omit<MonitoringState['keyboard'], 'camera'> };
type RuntimeProps = { base: BaseState; children: ReactNode; openCamera: (mode: string, ratio: number) => void;
  portal: HTMLElement | null; configMode: MonitoringMode; setConfigMode: (mode: MonitoringMode) => void;
  onPosture: (value: MonitorSnapshot) => void; onKeyboard: (value: KeyboardMonitorSnapshot) => void;
  onEyeUpdate: (value: EyeUpdate) => void; onEyeSample: (at: number, value: EyeSnapshot) => void;
  remapRequest: number; referenceRequest: number; eyeRetryRequest: number;
  sensitivity: ReturnType<typeof readSensitivity>; faces: FaceBuffer; cameraRun: string };
const deviceLabel = (session: ReturnType<typeof useSessionControls>) => session.devices.find(device => device.deviceId === session.deviceId)?.label || '기본 카메라';
function KeyboardCamera(props: RuntimeProps) {
  const upperCamera = useCameraSettings();
  const { controls } = props.base.keyboard;
  return <CameraProvider modeId="keyboard" deviceId={controls.deviceId} cameraLabel={deviceLabel(controls)} paused={controls.isPaused} onOpen={props.openCamera}><MonitoringRuntime {...props} upperCamera={upperCamera} /></CameraProvider>;
}
function MonitoringRuntime({ base, children, upperCamera, portal, configMode, setConfigMode, onPosture, onKeyboard, onEyeUpdate, onEyeSample,
  remapRequest, referenceRequest, eyeRetryRequest, sensitivity, faces, cameraRun }: RuntimeProps & { upperCamera: CameraContextValue }) {
  const keyboardCamera = useCameraSettings();
  const upper = base.upper.controls, keyboard = base.keyboard.controls;
  const session = configMode === 'upper_body' ? upper : keyboard;
  const camera = configMode === 'upper_body' ? upperCamera : keyboardCamera;
  return <MonitoringContext.Provider value={{ upper: { ...base.upper, camera: upperCamera }, keyboard: { ...base.keyboard, camera: keyboardCamera } }}>
    <MonitoringDesktopBridge />
    <div hidden aria-hidden="true">
      <CameraContext.Provider value={upperCamera}>
        <PostureMonitor key={upper.run} isRunning={upper.isRunning} paused={upper.isPaused} referenceRequest={referenceRequest} cameraRun={cameraRun} deviceId={upper.deviceId} onUpdate={onPosture} recordCapture={beginPostureRecording} balanceSensitivity={sensitivity.balance} habitRule={sensitivity.habit} faces={faces} />
        <EyeMonitor key={`eye:${upper.run}`} shared active={upper.isRunning && upperCamera.connected} paused={upper.isPaused} deviceId={upper.deviceId}
          reference={0} eyeReference={referenceRequest} retryRequest={eyeRetryRequest} sensitivity={sensitivity.eye}
          onUpdate={onEyeUpdate} onSample={onEyeSample} onFace={faces.push} />
      </CameraContext.Provider>
      <CameraContext.Provider value={keyboardCamera}>
        <KeyboardMonitor key={keyboard.run} isRunning={keyboard.isRunning} paused={keyboard.isPaused} deviceId={keyboard.deviceId} onUpdate={onKeyboard} remapRequest={remapRequest} external />
      </CameraContext.Provider>
    </div>
    {children}
    {portal && createPortal(<CameraContext.Provider value={camera}><CameraSettingsPanel key={`${configMode}:${session.deviceId}`} selection={<section>
      <h2>모드와 카메라</h2>
      <p role="status" className="camera-hint">{sessionLabel(session, configMode === 'upper_body' ? base.upper.snapshot.phase : base.keyboard.snapshot.phase)}</p>
      {session.failed && <p role="alert" className="camera-error">카메라·분석 연결을 확인한 뒤 본창에서 다시 시작해 주세요.</p>}
      <label className="camera-field">모드<select aria-label="모드" value={configMode} onChange={event => setConfigMode(event.target.value as MonitoringMode)}><option value="upper_body">상체 · 목·어깨·안구</option><option value="keyboard">키보드</option></select></label>
      <label className="camera-field">사용할 카메라<select aria-label="사용할 카메라" value={session.deviceId} disabled={session.isRunning} onChange={event => session.setDeviceId(event.target.value)}><option value="">기본 카메라</option>{session.devices.filter(device => device.deviceId).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `카메라 ${index + 1}`}</option>)}</select></label>
      {session.deviceError && <p role="alert" className="camera-error">{session.deviceError}</p>}
      {session.isRunning && <p className="camera-hint">장치를 바꾸려면 해당 모드를 중지해 주세요.</p>}
      <button type="button" className="camera-recapture" disabled={!session.isRunning || session.isPaused}
        onClick={configMode === 'upper_body' ? base.upper.recalibrate : base.keyboard.remap}>
        <RotateCcw size={16} />{configMode === 'upper_body' ? '기준 다시 잡기' : '위치 다시 잡기'}
      </button>
    </section>} keyboardStatus={configMode === 'keyboard' && keyboard.isRunning && !keyboard.isPaused ? base.keyboard.snapshot : undefined} /></CameraContext.Provider>, portal)}
  </MonitoringContext.Provider>;
}
