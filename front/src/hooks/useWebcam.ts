import { useCallback, useEffect, useRef, useState } from 'react';

/** A stopped/superseded permission request must dispose a stream that resolves later. */
export function createWebcamController(
  getVideo: () => HTMLVideoElement | null,
  onError: (message: string | null) => void,
) {
  let generation = 0;
  let activeStream: MediaStream | null = null;
  let attachedVideo: HTMLVideoElement | null = null;
  const release = () => {
    activeStream?.getTracks().forEach(track => track.stop());
    if (attachedVideo && attachedVideo.srcObject === activeStream) attachedVideo.srcObject = null;
    activeStream = null;
    attachedVideo = null;
  };
  const stopWebcam = () => { generation += 1; release(); };
  const startWebcam = async (deviceId?: string) => {
    const request = ++generation;
    release();
    onError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1280 }, height: { ideal: 720 },
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      });
      if (request !== generation) {
        stream.getTracks().forEach(track => track.stop());
        return null;
      }
      activeStream = stream;
      attachedVideo = getVideo();
      if (attachedVideo) attachedVideo.srcObject = stream;
      return stream;
    } catch (error) {
      if (request === generation) onError(error instanceof Error ? error.message : String(error));
      return null;
    }
  };
  return { startWebcam, stopWebcam };
}

export const useWebcam = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controller = useRef<ReturnType<typeof createWebcamController> | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    const instance = createWebcamController(
      () => videoRef.current,
      message => { if (mounted) setWebcamError(message); },
    );
    controller.current = instance;
    return () => { mounted = false; controller.current = null; instance.stopWebcam(); };
  }, []);
  const startWebcam = useCallback((deviceId?: string) =>
    controller.current?.startWebcam(deviceId) ?? Promise.resolve(null), []);
  const stopWebcam = useCallback(() => controller.current?.stopWebcam(), []);
  return { videoRef, startWebcam, stopWebcam, webcamError };
};
