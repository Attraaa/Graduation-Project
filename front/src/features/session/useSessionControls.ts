import { useCallback, useEffect, useRef, useState } from 'react';
import { createSessionClock } from './sessionClock';

export function useSessionControls(modeId?: string) {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [deviceId, selectDevice] = useState(() => modeId ? localStorage.getItem(`moti.camera-device.${modeId}`) ?? '' : '');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [run, setRun] = useState(0);
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
    clock.current.start();
    setElapsedSeconds(0);
    setRun(value => value + 1);
    setIsRunning(true);
    setIsPaused(false);
  }, []);
  const stop = useCallback(() => {
    clock.current.pause();
    setElapsedSeconds(clock.current.seconds());
    setIsRunning(false);
    setIsPaused(false);
  }, []);
  const pause = useCallback(() => { clock.current.pause(); setElapsedSeconds(clock.current.seconds()); setIsPaused(true); }, []);
  const resume = useCallback(() => { clock.current.resume(); setIsPaused(false); }, []);

  return { isRunning, isPaused, elapsedSeconds, run, deviceId, devices, setDeviceId, start, stop, pause, resume };
}
