export interface KeyboardCamera { left: number; top: number; width: number; height: number; angle: number; brightness: number; contrast: number; resolution: number }
export const defaultKeyboardCamera: KeyboardCamera = { left: 0, top: 0, width: 1, height: 1, angle: 0, brightness: 100, contrast: 100, resolution: 1280 };
const clamp = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
export function normalizeKeyboardCamera(input: Partial<KeyboardCamera>): KeyboardCamera {
  const left = clamp(input.left, 0, 0, .9), top = clamp(input.top, 0, 0, .9);
  return { left, top, width: clamp(input.width, 1, .1, 1 - left), height: clamp(input.height, 1, .1, 1 - top),
    angle: clamp(input.angle, 0, -180, 180), brightness: clamp(input.brightness, 100, 50, 150), contrast: clamp(input.contrast, 100, 50, 150),
    resolution: [640, 1280, 1920].includes(input.resolution ?? 0) ? input.resolution! : 1280 };
}
export function readKeyboardCamera(): KeyboardCamera {
  try { return normalizeKeyboardCamera(JSON.parse(localStorage.getItem('moti.keyboard.camera') ?? '{}')); }
  catch { return { ...defaultKeyboardCamera }; }
}
export function cameraTransform(width: number, height: number, input: KeyboardCamera) {
  const camera = normalizeKeyboardCamera(input), radians = camera.angle * Math.PI / 180;
  const cosine = Math.abs(Math.cos(radians)), sine = Math.abs(Math.sin(radians));
  const cropWidth = camera.width * width, cropHeight = camera.height * height;
  // Every output corner lies inside the cropped source after inverse rotation.
  const scale = Math.max((cosine * width + sine * height) / cropWidth, (sine * width + cosine * height) / cropHeight);
  return { x: camera.left * width, y: camera.top * height, width: cropWidth, height: cropHeight, scale, radians };
}
export function drawKeyboardFrame(canvas: HTMLCanvasElement, video: HTMLVideoElement, camera: KeyboardCamera) {
  const width = video.videoWidth, height = video.videoHeight;
  if (!width || !height) return false;
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const context = canvas.getContext('2d'); if (!context) return false;
  const crop = cameraTransform(width, height, camera);
  context.save(); context.clearRect(0, 0, width, height); context.translate(width / 2, height / 2);
  context.rotate(crop.radians); context.scale(crop.scale, crop.scale);
  context.filter = `brightness(${camera.brightness}%) contrast(${camera.contrast}%)`;
  context.drawImage(video, crop.x, crop.y, crop.width, crop.height, -crop.width / 2, -crop.height / 2, crop.width, crop.height);
  context.restore(); return true;
}
