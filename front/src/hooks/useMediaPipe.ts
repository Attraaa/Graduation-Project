import { useRef, useCallback, useState } from 'react';

const scriptStatus: Record<string, 'loading' | 'loaded' | 'error'> = {};

const loadScript = (src: string) => {
  return new Promise((resolve, reject) => {
    if (scriptStatus[src] === 'loaded') {
      resolve(true);
      return;
    }
    
    if (scriptStatus[src] === 'loading') {
      // Wait for it to finish loading
      const checkInterval = setInterval(() => {
        if (scriptStatus[src] === 'loaded') {
          clearInterval(checkInterval);
          resolve(true);
        } else if (scriptStatus[src] === 'error') {
          clearInterval(checkInterval);
          reject(new Error(`Script load failed: ${src}`));
        }
      }, 100);
      return;
    }

    scriptStatus[src] = 'loading';
    const script = document.createElement('script');
    script.src = src;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      scriptStatus[src] = 'loaded';
      resolve(true);
    };
    script.onerror = (err) => {
      scriptStatus[src] = 'error';
      reject(err);
    };
    document.body.appendChild(script);
  });
};

export const useMediaPipe = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const poseRef = useRef<any>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const initMediaPipe = useCallback(async (onResults: (results: any) => void) => {
    try {
      setAiError(null);
      setIsLoaded(false);
      
      await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js");
      await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js");

      let Pose = (window as any).Pose;
      let retries = 0;
      while (!Pose && retries < 20) {
        await new Promise(r => setTimeout(r, 100)); // wait 100ms
        Pose = (window as any).Pose;
        retries++;
      }

      if (!Pose) throw new Error("MediaPipe Pose class not found from CDN");

      const pose = new Pose({
        locateFile: (file: string) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        }
      });
      poseRef.current = pose;

      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      pose.onResults(onResults);
      setIsLoaded(true);
      return pose;
    } catch (err: any) {
      console.error("Error setting up MediaPipe: ", err);
      setAiError(err.message || String(err));
      return null;
    }
  }, []);

  const startProcessing = useCallback((videoElement: HTMLVideoElement) => {
    const processFrame = async () => {
      if (videoElement && videoElement.readyState >= 2 && poseRef.current) {
        await poseRef.current.send({ image: videoElement });
      }
      animationRef.current = requestAnimationFrame(processFrame);
    };
    processFrame();
  }, []);

  const stopProcessing = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (poseRef.current) {
      poseRef.current.close();
      poseRef.current = null;
    }
    setIsLoaded(false);
  }, []);

  return { canvasRef, initMediaPipe, startProcessing, stopProcessing, aiError, isLoaded };
};
