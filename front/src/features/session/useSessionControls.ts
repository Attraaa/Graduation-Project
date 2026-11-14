import { useCallback, useEffect, useRef, useState } from 'react';
import { createSessionClock } from './sessionClock';

export function useSessionControls(modeId?: string) {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [deviceId, selectDevice] = useState(() => modeId ? localStorage.getItem(`moti.camera-device.${modeId}`) ?? '' : '');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [run, setRun] = useState(0);
  const [failed, setFailed] = useState(false);
  const current = useRef({ running: false, paused: false, run: 0 });
  const clock = useRef(createSessionClock());
  const setDeviceId = useCallback((id: string) => {
    selectDevice(id);
    if (modeId) localStorage.setItem(`moti.camera-device.${modeId}`, id);
  }, [modeId]);

  useEffect(() => {
    let active = true;
    const media = navigator.mediaDevices;
    if (!media) return;
    const refresh = () => void media.enumerateDevices()
      .then(list => { if (active) setDevices(list.filter(device => device.kind === 'videoinput')); })
      .catch(() => { /* Starting the camera presents the actionable permission/device error. */ });
    refresh();
    media.addEventListener('devicechange', refresh);
    return () => { active = false; media.removeEventListener('devicechange', refresh); };
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning || isPaused) return;
    const timer = window.setInterval(() => setElapsedSeconds(clock.current.seconds()), 1000);
    return () => window.clearInterval(timer);
  }, [isRunning, isPaused, run]);

  const start = useCallback(() => {
    if (current.current.running) return;
    current.current = { running: true, paused: false, run: current.current.run + 1 };
    setFailed(false);
    clock.current.start();
    setElapsedSeconds(0);
    setRun(value => value + 1);
    setIsRunning(true);
    setIsPaused(false);
  }, []);
  const stop = useCallback(() => {
    current.current.running = false;
    current.current.paused = false;
    clock.current.pause();
    setElapsedSeconds(clock.current.seconds());
    setIsRunning(false);
    setIsPaused(false);
  }, []);
  const pause = useCallback(() => {
    if (!current.current.running || current.current.paused) return;
    current.current.paused = true; clock.current.pause(); setElapsedSeconds(clock.current.seconds()); setIsPaused(true);
  }, []);
  const resume = useCallback(() => {
    if (!current.current.running || !current.current.paused) return;
    current.current.paused = false; clock.current.resume(); setIsPaused(false);
  }, []);
  const fail = useCallback(() => { if (current.current.running) { stop(); setFailed(true); } }, [stop]);
  const getState = useCallback(() => ({ ...current.current }), []);

  return { isRunning, isPaused, elapsedSeconds, run, failed, deviceId, devices, setDeviceId, start, stop, pause, resume, fail, getState };
}
