/** Async ownership boundary, independently testable without camera or WASM. */
export function createEyeRunner<T extends { close(): void }>(dependencies: {
  camera: () => Promise<MediaStream | null>;
  stopCamera: () => void;
  model: () => Promise<T>;
  ready: (model: T) => Promise<void>;
  error: (error: unknown) => void;
}) {
  let cancelled = false;
  let owned: T | null = null;
  const stop = () => {
    cancelled = true;
    dependencies.stopCamera();
    const model = owned;
    owned = null;
    model?.close();
  };
  const start = async () => {
    try {
      const stream = await dependencies.camera();
      if (cancelled) { stream?.getTracks().forEach(track => track.stop()); return; }
      if (!stream) throw new Error('카메라를 열지 못했습니다. 권한과 다른 앱의 카메라 사용을 확인한 뒤 다시 시작해 주세요.');
      const model = await dependencies.model();
      if (cancelled) { model.close(); return; }
      owned = model;
      await dependencies.ready(model);
    } catch (error) {
      if (!cancelled) { stop(); dependencies.error(error); }
    }
  };
  return { start, stop };
}
