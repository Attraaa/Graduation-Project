import { useEffect, useRef, useState } from 'react';

export function useSessionControls() {
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [deviceId, setDeviceId] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [run, setRun] = useState(0);
  const startedAtRef = useRef<number | null>(null);

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
    if (!isRunning) return;
    const startedAt = startedAtRef.current;
    if (startedAt === null) return;
    const timer = window.setInterval(() => setElapsedSeconds((performance.now() - startedAt) / 1000), 1000);
    return () => window.clearInterval(timer);
  }, [isRunning, run]);

  const start = () => {
    startedAtRef.current = performance.now();
    setElapsedSeconds(0);
    setRun(value => value + 1);
    setIsRunning(true);
  };
  const stop = () => {
    if (startedAtRef.current !== null) {
      setElapsedSeconds((performance.now() - startedAtRef.current) / 1000);
      startedAtRef.current = null;
    }
    setIsRunning(false);
  };

  return { isRunning, elapsedSeconds, run, deviceId, devices, setDeviceId, start, stop };
}
