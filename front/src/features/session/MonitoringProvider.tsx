import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import CameraProvider from '../camera/CameraProvider';
import { CameraContext, useCameraSettings, type CameraContextValue } from '../camera/context';
import CameraSettingsPanel from '../camera/CameraSettingsPanel';
import { useCameraWindow } from '../camera/useCameraWindow';
import PostureMonitor from '../../components/PostureMonitor';
import KeyboardMonitor from '../../components/KeyboardMonitor';
import EyeMonitor, { type EyeUpdate } from '../eye/EyeMonitor';
import { emptyEyeSnapshot, type EyeSnapshot } from '../eye/measurement';
import { beginEyeRecording, type EyeSink } from '../eye/recording';
import type { EyeSensitivity } from '../eye/eyePolicy';
import { beginPostureRecording } from '../records/recording';
import { createMonitorSnapshot, type MonitorSnapshot } from '../posture/monitorTypes';
import { initialKeyboardSnapshot, type KeyboardMonitorSnapshot } from '../keyboard/monitorTypes';
import { livePressScore } from '../keyboard/liveScore';
import { useSessionControls } from './useSessionControls';
import { MonitoringContext, type MonitoringMode, type MonitoringState } from './monitoringContext';
import { appendTrend, type TrendPoint } from './trend';

const initialEye = (): EyeUpdate => ({ measurement: emptyEyeSnapshot(), phase: 'loading', message: '' });
// Keep measurement and recording on one preset until the settings UI is connected.
const eyeSensitivity: EyeSensitivity = 'normal';
export default function MonitoringProvider({ children }: { children: ReactNode }) {
  const upper = useSessionControls('upper_body');
  const keyboard = useSessionControls('keyboard');
  const [snapshot, setSnapshot] = useState(createMonitorSnapshot);
  const [eye, setEye] = useState(initialEye);
  const [keys, setKeys] = useState(initialKeyboardSnapshot);
  const [remap, setRemap] = useState(0);
  const [referenceRequest, setReferenceRequest] = useState(0);
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
    setUpperTrend(points => appendTrend(points, { at: performance.now(), neck: value.neck.currentScore, shoulder: value.shoulder.currentScore, keyboard: null }));
  }, []);
  const onKeyboard = useCallback((value: KeyboardMonitorSnapshot) => {
    setKeys(value);
    // Plot an input only when a new press was actually judged; no idle synthetic scores.
    if (value.latest && value.latest.id !== lastPress.current) {
      lastPress.current = value.latest.id;
      lastInputAt.current = performance.now();
      setKeyboardTrend(points => appendTrend(points, { at: performance.now(), neck: null, shoulder: null, keyboard: livePressScore(value.latest) }));
    }
  }, []);
  const onEyeSample = useCallback((at: number, value: EyeSnapshot) => eyeSink.current?.sample(at, value), []);
  const onEyeUpdate = useCallback((value: EyeUpdate) => { setEye(value); if (value.phase === 'error') eyeSink.current?.finish(); }, []);
  const startUpper = () => {
    if (upper.isRunning) return;
    eyeSink.current?.finish(); eyeSink.current = beginEyeRecording(eyeSensitivity);
    setEye(initialEye()); setSnapshot(createMonitorSnapshot()); setUpperTrend([]);
    upper.start();
  };
  const startKeyboard = () => { if (keyboard.isRunning) return; lastPress.current = null; setKeys(initialKeyboardSnapshot); setKeyboardTrend([]); keyboard.start(); };
  useEffect(() => { if (!upper.isRunning) { eyeSink.current?.finish(); eyeSink.current = null; } }, [upper.isRunning]);
  useEffect(() => () => eyeSink.current?.finish(), []);
  useEffect(() => {
    if (!keyboard.isRunning || keyboard.isPaused) return;
    const timer = window.setInterval(() => {
      const at = performance.now();
      if (at - lastInputAt.current > 1500) setKeyboardTrend(points => points.length ? appendTrend(points, { at, neck: null, shoulder: null, keyboard: null }) : points);
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
    upper: { controls: { ...upper, pause: () => { upper.pause(); setUpperTrend(points => appendTrend(points, { at: performance.now(), neck: null, shoulder: null, keyboard: null })); } }, snapshot, eye, trend: upperTrend, start: startUpper, recalibrate: () => { setUpperTrend([]); setReferenceRequest(value => value + 1); } },
    keyboard: { controls: { ...keyboard, pause: () => { keyboard.pause(); setKeyboardTrend(points => appendTrend(points, { at: performance.now(), neck: null, shoulder: null, keyboard: null })); } }, snapshot: keys, trend: keyboardTrend, start: startKeyboard, remap: () => setRemap(value => value + 1) },
  };
  return <CameraProvider modeId="upper_body" deviceId={upper.deviceId} cameraLabel={deviceLabel(upper)} paused={upper.isPaused} onOpen={openCamera}>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <KeyboardCamera base={base} openCamera={openCamera} portal={portal} configMode={configMode} setConfigMode={setConfigMode} onPosture={onPosture} onKeyboard={onKeyboard} onEyeUpdate={onEyeUpdate} onEyeSample={onEyeSample} remapRequest={remap} referenceRequest={referenceRequest}>{children}</KeyboardCamera>
  </CameraProvider>;
}

type BaseState = { upper: Omit<MonitoringState['upper'], 'camera'>; keyboard: Omit<MonitoringState['keyboard'], 'camera'> };
type RuntimeProps = { base: BaseState; children: ReactNode; openCamera: (mode: string, ratio: number) => void;
  portal: HTMLElement | null; configMode: MonitoringMode; setConfigMode: (mode: MonitoringMode) => void;
  onPosture: (value: MonitorSnapshot) => void; onKeyboard: (value: KeyboardMonitorSnapshot) => void;
  onEyeUpdate: (value: EyeUpdate) => void; onEyeSample: (at: number, value: EyeSnapshot) => void; remapRequest: number; referenceRequest: number };
const deviceLabel = (session: ReturnType<typeof useSessionControls>) => session.devices.find(device => device.deviceId === session.deviceId)?.label || '기본 카메라';
function KeyboardCamera(props: RuntimeProps) {
  const upperCamera = useCameraSettings();
  const { controls } = props.base.keyboard;
  return <CameraProvider modeId="keyboard" deviceId={controls.deviceId} cameraLabel={deviceLabel(controls)} paused={controls.isPaused} onOpen={props.openCamera}><MonitoringRuntime {...props} upperCamera={upperCamera} /></CameraProvider>;
}
function MonitoringRuntime({ base, children, upperCamera, portal, configMode, setConfigMode, onPosture, onKeyboard, onEyeUpdate, onEyeSample, remapRequest, referenceRequest }: RuntimeProps & { upperCamera: CameraContextValue }) {
  const keyboardCamera = useCameraSettings();
  const upper = base.upper.controls, keyboard = base.keyboard.controls;
  const session = configMode === 'upper_body' ? upper : keyboard;
  const camera = configMode === 'upper_body' ? upperCamera : keyboardCamera;
  return <MonitoringContext.Provider value={{ upper: { ...base.upper, camera: upperCamera }, keyboard: { ...base.keyboard, camera: keyboardCamera } }}>
    <div hidden aria-hidden="true">
      <CameraContext.Provider value={upperCamera}>
        <PostureMonitor key={upper.run} isRunning={upper.isRunning} paused={upper.isPaused} referenceRequest={referenceRequest} deviceId={upper.deviceId} onUpdate={onPosture} recordCapture={beginPostureRecording} />
        <EyeMonitor key={`eye:${upper.run}`} shared active={upper.isRunning && upperCamera.connected} paused={upper.isPaused} deviceId={upper.deviceId} reference={0} eyeReference={referenceRequest} sensitivity={eyeSensitivity} onUpdate={onEyeUpdate} onSample={onEyeSample} />
      </CameraContext.Provider>
      <CameraContext.Provider value={keyboardCamera}>
        <KeyboardMonitor key={keyboard.run} isRunning={keyboard.isRunning} paused={keyboard.isPaused} deviceId={keyboard.deviceId} onUpdate={onKeyboard} remapRequest={remapRequest} external />
      </CameraContext.Provider>
    </div>
    {children}
    {portal && createPortal(<CameraContext.Provider value={camera}><CameraSettingsPanel key={`${configMode}:${session.deviceId}`} selection={<section>
      <h2>모드와 카메라</h2>
      <label className="camera-field">모드<select aria-label="모드" value={configMode} onChange={event => setConfigMode(event.target.value as MonitoringMode)}><option value="upper_body">상체 · 목·어깨·안구</option><option value="keyboard">키보드</option></select></label>
      <label className="camera-field">사용할 카메라<select aria-label="사용할 카메라" value={session.deviceId} disabled={session.isRunning} onChange={event => session.setDeviceId(event.target.value)}><option value="">기본 카메라</option>{session.devices.filter(device => device.deviceId).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `카메라 ${index + 1}`}</option>)}</select></label>
      {session.isRunning && <p className="camera-hint">장치를 바꾸려면 해당 모드를 중지해 주세요.</p>}
    </section>} /></CameraContext.Provider>, portal)}
  </MonitoringContext.Provider>;
}
