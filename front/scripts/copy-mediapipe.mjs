import { cp, mkdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Keep the script, WASM and model files from one locked package together.
const source = fileURLToPath(new URL('../node_modules/@mediapipe/pose/', import.meta.url));
const destination = fileURLToPath(new URL('../public/mediapipe/pose/', import.meta.url));
await mkdir(destination, { recursive: true });
// npm ci changes source timestamps. Unchanged assets need no repeated large WASM writes.
const copyChanged = async (from, to) => {
  const sourceStat = await stat(from);
  if (sourceStat.isDirectory()) return true;
  try {
    const targetStat = await stat(to);
    return sourceStat.size !== targetStat.size || Math.abs(sourceStat.mtimeMs - targetStat.mtimeMs) > 1;
  } catch (error) { if (error.code === 'ENOENT') return true; throw error; }
};
await cp(source, destination, { recursive: true, preserveTimestamps: true, filter: copyChanged });
console.log('MediaPipe Pose assets ready (unchanged files reused).');

const faceWasm = new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url);
const faceDestination = new URL('../public/mediapipe/face/wasm/', import.meta.url);
await mkdir(faceDestination, { recursive: true });
await cp(faceWasm, faceDestination, { recursive: true, preserveTimestamps: true, filter: copyChanged });
const model = await readFile(new URL('../public/models/face_landmarker.task', import.meta.url));
const sha256 = createHash('sha256').update(model).digest('hex');
if (sha256 !== '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff') {
  throw new Error('Face Landmarker model checksum differs. See docs/eye-mode.md.');
}
console.log('MediaPipe Face WASM copied; local Face Landmarker model found.');
