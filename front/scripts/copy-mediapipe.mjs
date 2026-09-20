import { cp, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Keep the script, WASM and model files from one locked package together.
const source = fileURLToPath(new URL('../node_modules/@mediapipe/pose/', import.meta.url));
const destination = fileURLToPath(new URL('../public/mediapipe/pose/', import.meta.url));
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
console.log('MediaPipe Pose assets copied from the locked npm package.');

const faceWasm = new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url);
const faceDestination = new URL('../public/mediapipe/face/wasm/', import.meta.url);
await mkdir(faceDestination, { recursive: true });
await cp(faceWasm, faceDestination, { recursive: true });
const model = await readFile(new URL('../public/models/face_landmarker.task', import.meta.url));
const sha256 = createHash('sha256').update(model).digest('hex');
if (sha256 !== '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff') {
  throw new Error('Face Landmarker model checksum differs. See docs/eye-mode.md.');
}
console.log('MediaPipe Face WASM copied; local Face Landmarker model found.');
