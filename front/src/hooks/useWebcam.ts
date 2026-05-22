import { useRef, useCallback, useState } from 'react';

export const useWebcam = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);

  const startWebcam = useCallback(async () => {
    try {
      setWebcamError(null);
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { exact: 1280 },
            height: { exact: 720 },
            aspectRatio: { exact: 16 / 9 },
          }
        });
      } catch (err: any) {
        if (err?.name !== 'OverconstrainedError') {
          throw err;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            aspectRatio: { ideal: 16 / 9 },
          }
        });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err: any) {
      console.error("Error accessing the webcam: ", err);
      setWebcamError(err.message || String(err));
      return null;
    }
  }, []);

  const stopWebcam = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  return { videoRef, startWebcam, stopWebcam, webcamError };
};
