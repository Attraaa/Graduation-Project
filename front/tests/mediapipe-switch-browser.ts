import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { Pose } from '@mediapipe/pose';
import { initializeMediaPipe } from '../src/features/session/mediaPipeInitialization';

const button = document.querySelector<HTMLButtonElement>('#run')!;
const output = document.querySelector('#result')!;
button.onclick = async () => {
  button.disabled = true;
  const messages: string[] = [];
  output.textContent = '모델 로딩 중';
  try {
    if (!(window as Window & { Pose?: typeof Pose }).Pose) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/mediapipe/pose/pose.js';
        script.onload = () => resolve(); script.onerror = reject;
        document.head.append(script);
      });
    }
    const Constructor = (window as Window & { Pose: typeof Pose }).Pose;
    const files = await FilesetResolver.forVisionTasks('/mediapipe/face/wasm');
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const pose = async () => {
      const model = new Constructor({ locateFile: file => `/mediapipe/pose/${file}` });
      model.setOptions({ modelComplexity: 1 });
      try { await initializeMediaPipe(() => model.initialize()); await model.send({ image: canvas }); }
      finally { await model.close(); }
      messages.push('Pose init/infer/close OK');
    };
    const eye = async () => {
      const model = await initializeMediaPipe(() => FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'CPU' },
        runningMode: 'VIDEO', numFaces: 2, outputFaceBlendshapes: true,
      }), true);
      try { model.detectForVideo(canvas, performance.now()); } finally { model.close(); }
      messages.push('Face init/infer/close OK');
    };
    await pose(); await eye(); await pose(); await eye(); await eye();
    await Promise.all([pose(), eye()]);
    output.textContent = [...messages, 'PASS'].join('\n');
  } catch (error) { output.textContent = [...messages, `FAIL: ${String(error)}`].join('\n'); }
  finally { button.disabled = false; }
};
