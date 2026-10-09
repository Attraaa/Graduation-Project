import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { drawKeyboardFrame } from '../keyboard/camera';
import { CameraContext, type CameraRuntime } from './context';
import { imageSignature, normalizeProfile, readProfile, resolveProfile, writeProfile, type CameraProfile, type Quad } from './profile';
import { unframePoint } from './framing';
import CameraSettingsPanel from './CameraSettingsPanel';
import './cameraSettings.css';

export default function CameraProvider({ modeId, deviceId, cameraLabel, children }: {
  modeId: string; deviceId: string; cameraLabel: string; children: ReactNode;
}) {
  const [profile, setProfile] = useState(() => readProfile(localStorage, modeId, deviceId));
  const [connected, setConnected] = useState(false);
  const [exposureError, setExposureError] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState(cameraLabel);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const popup = useRef<Window | null>(null);
  const runtime = useRef<CameraRuntime>({ profile, canvas: null, overlay: null, track: null, deviceId, editing: false, generation: 0, frameAt: null, videoTime: -1, metrics: null, invalidate: null });
  const animation = useRef(0);
  const removeEnded = useRef<() => void>(() => {});
  const pendingChanges = useRef<Partial<CameraProfile>>({});
  const applyQueue = useRef(Promise.resolve());
  const update = useCallback((change: Partial<CameraProfile>) => {
    const state = runtime.current;
    const next = normalizeProfile({ ...state.profile, ...change }, modeId);
    const imageChanged = imageSignature(next) !== imageSignature(state.profile);
    const gridSignature = (profile: CameraProfile) => profile.grid.source === 'manual' ? JSON.stringify(profile.grid) : 'automatic';
    const gridChanged = gridSignature(next) !== gridSignature(state.profile);
    const hardwareChanged = next.resolution !== state.profile.resolution || next.exposureMode !== state.profile.exposureMode || next.exposure !== state.profile.exposure;
    if (imageChanged || hardwareChanged) {
      state.generation++;
      state.overlay?.getContext('2d')?.clearRect(0, 0, state.overlay.width, state.overlay.height);
    }
    state.profile = next;
    if ((imageChanged || gridChanged || hardwareChanged) && !state.editing) state.invalidate?.();
    if (!state.track) pendingChanges.current = { ...pendingChanges.current, ...change };
    writeProfile(localStorage, modeId, state.track ? state.deviceId : deviceId, next);
    setProfile(next);
  }, [modeId, deviceId]);
  // Edits/detections arrive in the current analysis image; store pre-zoom coordinates.
  const setGrid = useCallback((grid: CameraProfile['grid']) => update({ grid: { ...grid,
    quad: grid.quad.map(point => unframePoint(point, runtime.current.profile)) as Quad } }), [update]);
  const setEditing = useCallback((editing: boolean) => { const state = runtime.current; if (state.editing !== editing) { state.editing = editing; state.invalidate?.(); } }, []);
  const reportMetrics = useCallback((metrics: CameraRuntime['metrics']) => { runtime.current.metrics = metrics; }, []);
  const setInvalidator = useCallback((callback: (() => void) | null) => { runtime.current.invalidate = callback; }, []);
  const detach = useCallback(() => {
    cancelAnimationFrame(animation.current);
    removeEnded.current(); removeEnded.current = () => {};
    const state = runtime.current;
    state.generation++;
    if (state.canvas) { state.canvas.width = 0; state.canvas.height = 0; }
    if (state.overlay) { state.overlay.width = 0; state.overlay.height = 0; }
    state.canvas = null; state.overlay = null; state.track = null; state.editing = false; state.metrics = null; state.frameAt = null; state.videoTime = -1;
    setConnected(false);
  }, []);
  const connect = useCallback(async (video: HTMLVideoElement, stream: MediaStream, canvas: HTMLCanvasElement, overlay?: HTMLCanvasElement | null) => {
    const state = runtime.current;
    const track = stream.getVideoTracks()[0];
    const actualDevice = track.getSettings().deviceId || deviceId;
    if (!actualDevice) throw new Error('카메라 식별 정보를 읽지 못했습니다. 사용할 카메라를 직접 선택해 주세요.');
    // Resolve the actual default camera first, then apply only explicit pre-start edits.
    // Never transfer a previous default camera's entire profile to a different device.
    const next = normalizeProfile({ ...resolveProfile(localStorage, modeId, actualDevice), ...pendingChanges.current }, modeId);
    pendingChanges.current = {};
    state.deviceId = actualDevice; state.profile = next;
    setActiveLabel(track.label || '선택한 카메라');
    writeProfile(localStorage, modeId, actualDevice, next);
    setProfile(next);
    state.canvas = canvas; state.overlay = overlay ?? null; state.track = track;
    state.frameAt = null; state.videoTime = -1;
    removeEnded.current();
    const ended = () => { if (state.track === track) detach(); };
    track.addEventListener('ended', ended);
    removeEnded.current = () => track.removeEventListener('ended', ended);
    state.generation++;
    await video.play();
    if (state.track !== track || track.readyState === 'ended') return;
    const draw = () => {
      if (state.track !== track || track.readyState === 'ended') return;
      if (video.readyState >= 2) {
        if (video.currentTime !== state.videoTime) { state.videoTime = video.currentTime; state.frameAt = performance.now(); }
        drawKeyboardFrame(canvas, video, state.profile);
      }
      animation.current = requestAnimationFrame(draw);
    };
    cancelAnimationFrame(animation.current); draw(); setConnected(true);
  }, [deviceId, modeId, detach]);
  // Camera capabilities are consulted only on the stream owned by a started session.
  useEffect(() => {
    const track = runtime.current.track;
    if (!connected || !track) return;
    applyQueue.current = applyQueue.current.catch(() => {}).then(async () => {
      if (runtime.current.track !== track || track.readyState === 'ended') return;
      const latest = runtime.current.profile;
      if (latest.resolution !== profile.resolution || latest.exposureMode !== profile.exposureMode || latest.exposure !== profile.exposure) return;
      const caps = track.getCapabilities() as MediaTrackCapabilities & { exposureMode?: string[]; exposureTime?: { min: number; max: number; step: number } };
      const constraints: MediaTrackConstraints = { width: { ideal: profile.resolution }, height: { ideal: Math.round(profile.resolution * 9 / 16) } };
      const exposure: Record<string, unknown> = {};
      if (profile.exposureMode && caps.exposureMode?.includes(profile.exposureMode)) exposure.exposureMode = profile.exposureMode;
      if (profile.exposureMode === 'manual' && profile.exposure !== null && caps.exposureTime) exposure.exposureTime = Math.max(caps.exposureTime.min, Math.min(caps.exposureTime.max, profile.exposure));
      if (Object.keys(exposure).length) constraints.advanced = [exposure as MediaTrackConstraintSet];
      try { await track.applyConstraints(constraints); if (runtime.current.track === track) setExposureError(null); }
      catch (error) { if (runtime.current.track === track) setExposureError(error instanceof Error ? error.message : String(error)); }
    });
  }, [connected, profile.resolution, profile.exposureMode, profile.exposure]);
  const open = useCallback(() => {
    if (popup.current && !popup.current.closed) { popup.current.focus(); return; }
    const state = runtime.current;
    const ratio = state.canvas?.width && state.canvas.height ? state.canvas.width / state.canvas.height : 16 / 9;
    const width = Math.min(1100, screen.availWidth - 40);
    const height = Math.min(screen.availHeight - 80, Math.max(540, (width - 300 - 48) / ratio + 48 + 88 + (window.motiWindow ? 36 : 0)));
    const url = new URL('camera-settings.html', document.baseURI).href;
    const child = window.open(url, 'moti-camera-settings', `width=${width},height=${Math.round(height)}`);
    if (!child) { setExposureError('카메라 설정 창을 열지 못했습니다. 팝업 허용 설정을 확인해 주세요.'); return; }
    popup.current = child;
    const prepare = () => {
      if (child.closed) return;
      const root = child.document.getElementById('camera-settings-root');
      if (!root) return;
      child.document.documentElement.className = document.documentElement.className;
      child.document.body.className = 'camera-window';
      document.querySelectorAll('style, link[rel="stylesheet"]').forEach(style => child.document.head.appendChild(style.cloneNode(true)));
      setPortal(root);
    };
    child.addEventListener('load', prepare, { once: true });
    if (child.document.readyState === 'complete' && child.document.getElementById('camera-settings-root')) prepare();
  }, []);
  useEffect(() => {
    if (!portal) return;
    const observer = new MutationObserver(() => {
      const child = popup.current;
      if (child && !child.closed) child.document.documentElement.className = document.documentElement.className;
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const timer = window.setInterval(() => {
      if (popup.current?.closed) { popup.current = null; setPortal(null); runtime.current.editing = false; }
    }, 200);
    return () => { window.clearInterval(timer); observer.disconnect(); };
  }, [portal]);
  useEffect(() => () => { cancelAnimationFrame(animation.current); popup.current?.close(); }, []);
  useEffect(() => window.motiKeyboard?.onHalt(() => {
    popup.current?.close();
    window.dispatchEvent(new Event('moti-stop-measurement'));
  }), []);
  const value = { modeId, cameraLabel: activeLabel, profile, connected, runtime, update, setGrid, setEditing, reportMetrics, setInvalidator, connect, detach, open, exposureError };
  return <CameraContext.Provider value={value}>{children}{portal && createPortal(<CameraSettingsPanel />, portal)}</CameraContext.Provider>;
}
