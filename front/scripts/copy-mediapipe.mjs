import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Keep the script, WASM and model files from one locked package together.
const source = fileURLToPath(new URL('../node_modules/@mediapipe/pose/', import.meta.url));
const destination = fileURLToPath(new URL('../public/mediapipe/pose/', import.meta.url));
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
console.log('MediaPipe Pose assets copied from the locked npm package.');
