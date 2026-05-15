import { useRef, useCallback, useState } from 'react';

export const useWebcam = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);

  const startWebcam = useCallback(async () => {
    try {
      setWebcamError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } }
      });
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
