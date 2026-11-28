import type { App, BrowserWindow, IpcMain, IpcMainEvent, PowerMonitor, Screen } from 'electron';
import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 진단 기록(2026-11-24): 오래 켜 둔 뒤 화면이 까맣게 멈추는 원인을 다음에 확인하려고 userData/logs/moti-YYYY-MM-DD.log에
 * JSON 한 줄씩 남깁니다. 프로세스 종료·응답 없음·화면 장치 변화·절전과 1분마다 메모리·측정 상태만 적고, 영상·랜드마크·점수는
 * 적지 않습니다. 쓰기에 실패해도 앱을 멈추지 않으며, 14일 지난 파일은 시작할 때 지웁니다.
 */
const FILE = /^moti-(\d{4}-\d{2}-\d{2})\.log$/;
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function createDiagnosticLog(dir: string, now: () => Date = () => new Date()) {
  return {
    dir,
    write(event: string, data: Record<string, unknown> = {}) {
      try {
        mkdirSync(dir, { recursive: true });
        appendFileSync(path.join(dir, `moti-${day(now())}.log`), `${JSON.stringify({ t: now().toISOString(), event, ...data })}\n`);
      } catch { /* A full disk or a locked file must not stop measurement. */ }
    },
    prune(keepDays = 14) {
      const cutoff = now(); cutoff.setDate(cutoff.getDate() - keepDays);
      try {
        for (const name of readdirSync(dir)) {
          const match = FILE.exec(name);
          if (match && match[1] < day(cutoff)) unlinkSync(path.join(dir, name));
        }
      } catch { /* No folder yet. */ }
    },
  };
}
export type DiagnosticLog = ReturnType<typeof createDiagnosticLog>;

type Metric = { type: string; memory: { workingSetSize: number; peakWorkingSetSize: number; privateBytes?: number }; cpu: { percentCPUUsage: number } };
/** app.getAppMetrics()를 프로세스 종류별 개수·메모리(MB, 원래 KB)·CPU(%) 합계로 줄입니다. */
export function summarizeMetrics(metrics: readonly Metric[]) {
  const byType: Record<string, { count: number; workingSetMB: number; peakMB: number; privateMB: number; cpu: number }> = {};
  for (const m of metrics) {
    const t = byType[m.type] ??= { count: 0, workingSetMB: 0, peakMB: 0, privateMB: 0, cpu: 0 };
    t.count += 1; t.workingSetMB += m.memory.workingSetSize / 1024; t.peakMB += m.memory.peakWorkingSetSize / 1024;
    t.privateMB += (m.memory.privateBytes ?? 0) / 1024; t.cpu += m.cpu.percentCPUUsage;
  }
  for (const t of Object.values(byType)) {
    t.workingSetMB = Math.round(t.workingSetMB); t.peakMB = Math.round(t.peakMB); t.privateMB = Math.round(t.privateMB); t.cpu = Math.round(t.cpu * 10) / 10;
  }
  return byType;
}

const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
const record = (value: unknown) => (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
const ROUTES = new Set(['/', '/login', '/register', '/find-id', '/find-password', '/dashboard', '/statistics', '/history', '/ai-review', '/settings']);
const PHASES = new Set(['idle', 'starting', 'mapping', 'ready', 'error', 'calibrating', 'observing', 'unavailable']);
const known = (value: unknown, options: Set<string>) => typeof value === 'string' && options.has(value) ? value : null;
const mode = (value: unknown) => {
  const o = record(value);
  return { running: o.running === true, paused: o.paused === true, phase: known(o.phase, PHASES), seconds: number(o.seconds) };
};
/** 화면이 보낸 1분 표본에서 정해진 칸만 남깁니다. 다른 값과 긴 문자열은 버립니다. */
export function sanitizeRendererSample(input: unknown) {
  const o = record(input);
  const route = typeof o.route === 'string' ? o.route.replace(/^#/, '').split(/[?#]/, 1)[0] : null;
  return { heapUsedMB: number(o.heapUsedMB), heapLimitMB: number(o.heapLimitMB), route: known(route, ROUTES), visible: o.visible === true,
    upper: mode(o.upper), keyboard: mode(o.keyboard) };
}
/** Keep the error category and line without paths, URLs or request data. */
export function sanitizeRendererError(input: unknown) {
  const o = record(input);
  const name = typeof o.message === 'string' ? /^(TypeError|RangeError|ReferenceError|SyntaxError|AbortError|Error)(?::|$)/.exec(o.message)?.[1] : null;
  return { kind: o.kind === 'rejection' ? 'rejection' : 'error', name: name ?? null, line: number(o.line) };
}

type Dependencies = {
  app: Pick<App, 'on' | 'getAppMetrics' | 'getVersion' | 'getGPUFeatureStatus' | 'getGPUInfo'>;
  screen: Pick<Screen, 'on' | 'getAllDisplays'>;
  powerMonitor: Pick<PowerMonitor, 'on'>;
  ipc: Pick<IpcMain, 'on'>;
  /** Only the main window may send samples and errors. */
  mainWindow: () => BrowserWindow | null;
};

/** 앱 사건과 1분 표본을 기록합니다. 화면 표본이 빠진 줄(renderer: null)은 그 1분 동안 화면이 답하지 않았다는 뜻입니다. */
export function watchDiagnostics(log: DiagnosticLog, deps: Dependencies, intervalMs = 60_000) {
  const display = (d: Electron.Display) => ({ id: d.id, bounds: d.bounds, scale: d.scaleFactor, rotation: d.rotation });
  log.prune();
  log.write('app-start', { version: deps.app.getVersion(), electron: process.versions.electron ?? null, chrome: process.versions.chrome ?? null,
    platform: `${process.platform} ${os.release()}`, displays: deps.screen.getAllDisplays().map(display) });
  // The feature status reads "disabled_software" until the GPU process has reported in, so wait for the full info first.
  const timeout = new Promise<null>(resolve => { const t = setTimeout(() => resolve(null), 15_000); t.unref?.(); });
  void Promise.race([deps.app.getGPUInfo('complete').catch(() => null), timeout]).then(info => {
    const aux = (info as { auxAttributes?: { glRenderer?: string; displayType?: string } } | null)?.auxAttributes;
    log.write('gpu', { status: deps.app.getGPUFeatureStatus(), renderer: aux?.glRenderer ?? null, displayType: aux?.displayType ?? null, complete: !!info });
  });
  deps.app.on('child-process-gone', (_event, details) => log.write('child-process-gone', { type: details.type, reason: details.reason, exitCode: details.exitCode, name: details.name ?? null }));
  deps.app.on('browser-window-created', (_event, window) => {
    const title = window.getTitle();
    window.on('unresponsive', () => log.write('window-unresponsive', { window: title }));
    window.on('responsive', () => log.write('window-responsive', { window: title }));
    window.webContents.on('render-process-gone', (_e, details) => log.write('render-process-gone', { window: title, reason: details.reason, exitCode: details.exitCode }));
  });
  deps.screen.on('display-added', (_event, d) => log.write('display-added', display(d)));
  deps.screen.on('display-removed', (_event, d) => log.write('display-removed', display(d)));
  deps.screen.on('display-metrics-changed', (_event, d, changed) => log.write('display-metrics-changed', { ...display(d), changed }));
  deps.powerMonitor.on('suspend', () => log.write('suspend'));
  deps.powerMonitor.on('resume', () => log.write('resume'));
  deps.powerMonitor.on('lock-screen', () => log.write('lock-screen'));
  deps.powerMonitor.on('unlock-screen', () => log.write('unlock-screen'));

  const fromMain = (event: IpcMainEvent) => { const w = deps.mainWindow(); return !!w && !w.isDestroyed() && event.sender === w.webContents; };
  let latest: ReturnType<typeof sanitizeRendererSample> | null = null;
  deps.ipc.on('diagnostics:sample', (event, input) => { if (fromMain(event)) latest = sanitizeRendererSample(input); });
  let errors = 0, minuteStart = Date.now();
  deps.ipc.on('diagnostics:error', (event, input) => {
    if (!fromMain(event)) return;
    if (Date.now() - minuteStart > 60_000) { minuteStart = Date.now(); errors = 0; }
    if (++errors <= 20) log.write('renderer-error', sanitizeRendererError(input));
  });
  const timer = setInterval(() => {
    const w = deps.mainWindow(), gpu = deps.app.getGPUFeatureStatus();
    // After repeated GPU process crashes Chromium falls back to software drawing; these two show when that happened.
    log.write('sample', { processes: summarizeMetrics(deps.app.getAppMetrics()), gpu: { compositing: gpu.gpu_compositing, webgl: gpu.webgl },
      window: w && !w.isDestroyed() ? { visible: w.isVisible(), minimized: w.isMinimized(), focused: w.isFocused() } : null, renderer: latest });
    latest = null;
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
