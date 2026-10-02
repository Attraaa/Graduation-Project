// Development-only harness. Vite's production entry excludes this page.
// Supplies an empty canvas stream; never requests the user's real camera.
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import EyeSession from '../src/features/eye/EyeSession';
import '../src/index.css';

let activeTracks = 0;
let opens = 0;
const freeze = new URLSearchParams(location.search).get('freeze') === '1';
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 480;
  const context = canvas.getContext('2d')!;
  const stream = canvas.captureStream(freeze ? 0 : 30);
  activeTracks++; opens++;
  const track = stream.getVideoTracks()[0];
  const draw = window.setInterval(() => {
    if (track.readyState === 'ended') { clearInterval(draw); activeTracks--; return; }
    if (freeze) return;
    context.fillStyle = '#162438'; context.fillRect(0, 0, 640, 480);
    context.fillStyle = 'white'; context.font = '24px sans-serif'; context.fillText('TEST VIDEO - NO FACE', 100, 220);
  }, 33);
  return stream;
} });
const diagnostics = document.createElement('p');
diagnostics.setAttribute('role', 'status');
document.body.prepend(diagnostics);
window.setInterval(() => { diagnostics.textContent = `Test camera streams active: ${activeTracks}; opens: ${opens}`; }, 250);
createRoot(document.getElementById('root')!).render(
  <MemoryRouter><main className="mx-auto max-w-4xl p-6"><h1>TEST HARNESS: {freeze ? 'frozen first frame' : 'blank video'}, no real camera</h1><EyeSession /></main></MemoryRouter>,
);
