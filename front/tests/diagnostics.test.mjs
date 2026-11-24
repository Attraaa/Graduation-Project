import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDiagnosticLog, sanitizeRendererError, sanitizeRendererSample, summarizeMetrics, watchDiagnostics } from '../electron/diagnostics.ts';

const temp = () => mkdtempSync(path.join(tmpdir(), 'moti-diag-'));
const lines = (dir, name) => readFileSync(path.join(dir, name), 'utf8').trim().split('\n').map(line => JSON.parse(line));

test('each event is one JSON line in the day file; files older than 14 days are removed, others kept', () => {
  const dir = temp(); let now = new Date(2026, 10, 24, 21, 5);
  const log = createDiagnosticLog(dir, () => new Date(now));
  log.write('sample', { a: 1 }); log.write('close-timeout');
  assert.deepEqual(lines(dir, 'moti-2026-11-24.log').map(({ event, a }) => [event, a]), [['sample', 1], ['close-timeout', undefined]]);
  for (const name of ['moti-2026-11-09.log', 'moti-2026-11-10.log', 'notes.txt']) writeFileSync(path.join(dir, name), '');
  log.prune();
  assert.deepEqual(readdirSync(dir).sort(), ['moti-2026-11-10.log', 'moti-2026-11-24.log', 'notes.txt']);
  now = new Date(2026, 10, 25, 0, 1); log.write('sample');
  assert.ok(readdirSync(dir).includes('moti-2026-11-25.log'));
  rmSync(dir, { recursive: true });
});

test('a write that cannot reach the disk does not throw', () => {
  const dir = temp(); writeFileSync(path.join(dir, 'file'), '');
  assert.doesNotThrow(() => createDiagnosticLog(path.join(dir, 'file', 'logs')).write('sample'));
  rmSync(dir, { recursive: true });
});

test('process metrics are summed per type in MB, and renderer input keeps only the known fields', () => {
  const metric = (type, kb, cpu) => ({ type, memory: { workingSetSize: kb, peakWorkingSetSize: kb * 2, privateBytes: kb }, cpu: { percentCPUUsage: cpu } });
  assert.deepEqual(summarizeMetrics([metric('Tab', 512000, 12.34), metric('Tab', 512000, 1), metric('GPU', 204800, 3)]),
    { Tab: { count: 2, workingSetMB: 1000, peakMB: 2000, privateMB: 1000, cpu: 13.3 }, GPU: { count: 1, workingSetMB: 200, peakMB: 400, privateMB: 200, cpu: 3 } });
  const sample = sanitizeRendererSample({ heapUsedMB: 123.456, heapLimitMB: 'x', route: '#/dashboard'.padEnd(200, 'x'), visible: true, frames: [1, 2],
    upper: { running: true, paused: false, phase: 'observing', seconds: 1452.25, landmarks: [0.1] }, keyboard: null });
  assert.deepEqual(sample, { heapUsedMB: 123.5, heapLimitMB: null, route: '#/dashboard'.padEnd(60, 'x'), visible: true,
    upper: { running: true, paused: false, phase: 'observing', seconds: 1452.3 }, keyboard: { running: false, paused: false, phase: null, seconds: null } });
  assert.deepEqual(sanitizeRendererError({ kind: 'rejection', message: 'm', line: 3 }), { kind: 'rejection', message: 'm', source: null, line: 3, stack: null });
  assert.equal(sanitizeRendererError(null).kind, 'error');
});

test('crashes, hangs, display and power changes are logged; samples come only from the main window and a silent minute shows as null', async context => {
  context.mock.timers.enable({ apis: ['setInterval', 'Date'], now: new Date(2026, 10, 24, 20, 0).getTime() });
  const dir = temp(), log = createDiagnosticLog(dir);
  const app = Object.assign(new EventEmitter(), { getVersion: () => '1.0.0', getGPUFeatureStatus: () => ({ gpu_compositing: 'enabled', webgl: 'enabled' }),
    getGPUInfo: () => Promise.resolve({ auxAttributes: { glRenderer: 'ANGLE (NVIDIA)', displayType: 'ANGLE_D3D11' } }),
    getAppMetrics: () => [{ type: 'Tab', memory: { workingSetSize: 1024, peakWorkingSetSize: 1024 }, cpu: { percentCPUUsage: 5 } }] });
  const screen = Object.assign(new EventEmitter(), { getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1, rotation: 0 }] });
  const power = new EventEmitter(), ipc = new EventEmitter();
  const main = Object.assign(new EventEmitter(), { webContents: new EventEmitter(), isDestroyed: () => false, isVisible: () => true, isMinimized: () => false, isFocused: () => false, getTitle: () => 'Moti' });
  const stop = watchDiagnostics(log, { app, screen, powerMonitor: power, ipc, mainWindow: () => main }, 1000);
  app.emit('browser-window-created', {}, main);
  main.webContents.emit('render-process-gone', {}, { reason: 'oom', exitCode: -36861 });
  main.emit('unresponsive');
  app.emit('child-process-gone', {}, { type: 'GPU', reason: 'crashed', exitCode: 3 });
  screen.emit('display-metrics-changed', {}, { id: 2, bounds: { x: 1920, y: -383, width: 1080, height: 1920 }, scaleFactor: 1, rotation: 90 }, ['workArea']);
  power.emit('resume');
  ipc.emit('diagnostics:sample', { sender: {} }, { heapUsedMB: 999 });
  ipc.emit('diagnostics:sample', { sender: main.webContents }, { heapUsedMB: 80, upper: { running: true, phase: 'observing', seconds: 60 } });
  context.mock.timers.tick(1000); context.mock.timers.tick(1000);
  for (let i = 0; i < 25; i++) ipc.emit('diagnostics:error', { sender: main.webContents }, { message: `boom ${i}` });
  stop(); await new Promise(resolve => setImmediate(resolve));
  const events = lines(dir, readdirSync(dir)[0]);
  assert.deepEqual(events.map(e => e.event).filter(e => e !== 'renderer-error' && e !== 'gpu'),
    ['app-start', 'render-process-gone', 'window-unresponsive', 'child-process-gone', 'display-metrics-changed', 'resume', 'sample', 'sample']);
  assert.deepEqual(events.find(e => e.event === 'gpu'), { t: events.find(e => e.event === 'gpu').t, event: 'gpu',
    status: { gpu_compositing: 'enabled', webgl: 'enabled' }, renderer: 'ANGLE (NVIDIA)', displayType: 'ANGLE_D3D11', complete: true });
  assert.deepEqual(events.find(e => e.event === 'sample').gpu, { compositing: 'enabled', webgl: 'enabled' });
  assert.equal(events.find(e => e.event === 'render-process-gone').reason, 'oom');
  assert.deepEqual(events.find(e => e.event === 'display-metrics-changed').changed, ['workArea']);
  const samples = events.filter(e => e.event === 'sample');
  assert.equal(samples[0].renderer.heapUsedMB, 80); assert.equal(samples[0].processes.Tab.workingSetMB, 1); assert.equal(samples[1].renderer, null);
  assert.equal(events.filter(e => e.event === 'renderer-error').length, 20);
  rmSync(dir, { recursive: true });
});
