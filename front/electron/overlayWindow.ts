import type { BrowserWindow, BrowserWindowConstructorOptions, IpcMain, IpcMainInvokeEvent, Rectangle, Screen } from 'electron';
import { parseOverlayCommand, parseOverlaySnapshot, type OverlayCommand, type OverlayResult, type OverlaySnapshot, type OverlayView } from '../src/features/overlay/contract.ts';
import { trustedRecordUrl } from './recordHandlers.ts';

export const OVERLAY_SIZE = { width: 360, height: 320 };
export function fitOverlay(bounds: Rectangle, area: Rectangle): Rectangle {
  const width = Math.min(bounds.width, area.width), height = Math.min(bounds.height, area.height);
  return { width, height, x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))), y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))) };
}
type Dependencies = {
  owner: () => BrowserWindow | null;
  trustedOwner: (event: IpcMainInvokeEvent) => void;
  create: (options: BrowserWindowConstructorOptions) => BrowserWindow;
  screen: Pick<Screen, 'getDisplayMatching' | 'on'>;
  url: string;
  preload: string;
  beforeOpen: () => void;
  changed: () => void;
  readPosition: () => Rectangle | null;
  writePosition: (bounds: Rectangle) => void;
};

/** The second renderer only mirrors state and relays commands to the existing measurement owner. */
export class OverlayWindow {
  private deps: Dependencies;
  private window: BrowserWindow | null = null;
  private snapshot: OverlaySnapshot | null = null;
  private receivedAt = 0;
  private active = false;
  private opening: Promise<void> | null = null;
  private ready: { resolve: () => void; reject: (error: Error) => void } | null = null;
  private pending = new Map<string, { owner: string; resolve: (value: OverlayResult) => void; timer: ReturnType<typeof setTimeout> }>();
  private completed = new Map<string, OverlayResult>();
  private previous: { maximized: boolean; bounds: Rectangle } | null = null;

  constructor(ipc: Pick<IpcMain, 'handle' | 'on'>, deps: Dependencies) {
    this.deps = deps;
    ipc.on('desktop:publish', (event, input: unknown) => {
      try {
      deps.trustedOwner(event);
      if (input === null) { this.invalidate(); return; }
      const next = parseOverlaySnapshot(input);
      if (this.snapshot?.owner === next.owner && next.sequence <= this.snapshot.sequence) return;
      if (this.snapshot && this.snapshot.owner !== next.owner) this.invalidate();
      this.snapshot = next; this.receivedAt = Date.now(); this.push();
      } catch { /* Invalid send() payloads cannot terminate the main process. */ }
    });
    ipc.handle('desktop:open', event => { deps.trustedOwner(event); return this.open(); });
    ipc.on('desktop:complete', (event, id: unknown, result: unknown) => {
      try {
      deps.trustedOwner(event);
      if (typeof id !== 'string' || !result || typeof result !== 'object' || typeof (result as OverlayResult).ok !== 'boolean') return;
      const p = this.pending.get(id);
      if (p?.owner !== this.snapshot?.owner) return;
      this.finish(id, { ok: (result as OverlayResult).ok });
      } catch { /* Ignore replies from another window or expired renderer. */ }
    });
    ipc.handle('overlay:state', event => { this.trusted(event); return this.view(); });
    ipc.handle('overlay:ready', event => { this.trusted(event); this.ready?.resolve(); });
    ipc.handle('overlay:command', (event, input: unknown) => { this.trusted(event); return this.command(parseOverlayCommand(input)); });
    ipc.handle('overlay:back', event => { this.trusted(event); this.back(); });
    const heartbeat = setInterval(() => this.push(), 1000); heartbeat.unref();
    const reposition = () => {
      if (!this.window || this.window.isDestroyed()) return;
      const bounds = this.window.getBounds(); this.window.setBounds(fitOverlay(bounds, deps.screen.getDisplayMatching(bounds).workArea));
    };
    deps.screen.on('display-removed', reposition);
    deps.screen.on('display-metrics-changed', reposition);
  }
  isActive() { return this.active; }
  ownsFocusedWindow() { return !!this.window && !this.window.isDestroyed() && this.window.isFocused(); }
  view(): OverlayView { return { snapshot: this.snapshot, connected: !!this.snapshot && Date.now() - this.receivedAt < 4000 }; }
  private trusted(event: IpcMainInvokeEvent) {
    const w = this.window;
    if (!w || w.isDestroyed() || event.sender !== w.webContents || event.senderFrame !== w.webContents.mainFrame || !trustedRecordUrl(event.senderFrame.url, this.deps.url)) throw Error('허용되지 않은 오버레이 요청입니다.');
  }
  private push() { if (this.window && !this.window.isDestroyed()) this.window.webContents.send('overlay:state', this.view()); }
  private finish(id: string, result: OverlayResult) {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer); this.pending.delete(id); this.completed.set(id, result);
    if (this.completed.size > 64) this.completed.delete(this.completed.keys().next().value!);
    p.resolve(result);
  }
  private command(command: OverlayCommand): Promise<OverlayResult> {
    if (this.completed.has(command.id)) return Promise.resolve(this.completed.get(command.id)!);
    if (this.pending.has(command.id)) return Promise.resolve({ ok: false, message: '이미 처리 중인 명령입니다.' });
    const s = this.snapshot;
    if (!s || command.owner !== s.owner || command.run !== s[command.mode].run || (!this.view().connected && command.action !== 'stop')) return Promise.resolve({ ok: false, message: '측정 상태가 바뀌었습니다. 다시 확인해 주세요.' });
    const owner = this.deps.owner();
    if (!owner || owner.isDestroyed()) return Promise.resolve({ ok: false, message: '본창 연결을 확인해 주세요.' });
    return new Promise(resolve => {
      const timer = setTimeout(() => this.finish(command.id, { ok: false, message: '응답을 확인하지 못했습니다. 돌아가서 상태를 확인해 주세요.' }), 3000);
      this.pending.set(command.id, { owner: s.owner, resolve, timer }); owner.webContents.send('desktop:command', command);
    });
  }
  open(): Promise<void> {
    if (this.opening) return this.opening;
    if (this.window && this.active) { this.window.showInactive(); return Promise.resolve(); }
    const owner = this.deps.owner();
    if (!owner || owner.isDestroyed() || !this.view().connected) return Promise.reject(Error('측정 화면이 준비된 뒤 다시 시도해 주세요.'));
    this.deps.beforeOpen();
    this.previous = { maximized: owner.isMaximized(), bounds: owner.getNormalBounds() };
    const area = this.deps.screen.getDisplayMatching(owner.getBounds()).workArea;
    const saved = this.deps.readPosition();
    const initial = fitOverlay(saved ? { ...saved, ...OVERLAY_SIZE } : { ...OVERLAY_SIZE, x: area.x + area.width - OVERLAY_SIZE.width - 20, y: area.y + 80 }, area);
    const w = this.deps.create({ ...initial, frame: false, transparent: false, resizable: false, maximizable: false, minimizable: false,
      alwaysOnTop: true, skipTaskbar: true, show: false, backgroundColor: '#f3f5f8', title: 'Moti · 오버레이',
      webPreferences: { preload: this.deps.preload, additionalArguments: ['--moti-overlay'], partition: 'moti-overlay', contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    this.window = w;
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.webContents.on('will-navigate', (event, url) => { if (!trustedRecordUrl(url, this.deps.url)) event.preventDefault(); });
    w.webContents.on('render-process-gone', () => this.back());
    w.on('close', event => { event.preventDefault(); this.back(); }); // Alt+F4 also returns; no X is rendered.
    w.on('closed', () => { if (this.window === w) { this.window = null; this.active = false; this.restore(false); this.deps.changed(); } });
    const operation = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const ready = new Promise<void>((resolve, reject) => { this.ready = { resolve, reject }; timer = setTimeout(() => reject(Error('작은 창을 준비하지 못했습니다. 다시 시도해 주세요.')), 8000); });
        await Promise.all([w.loadURL(this.deps.url), ready]);
        if (this.window !== w || !this.snapshot || owner.isDestroyed()) throw Error('오버레이 전환이 취소되었습니다.');
        this.active = true; this.push(); w.showInactive(); owner.minimize(); this.deps.changed();
      } catch (error) { this.back(false); throw error; }
      finally { clearTimeout(timer); this.ready = null; }
    })();
    this.opening = operation;
    void operation.finally(() => { if (this.opening === operation) this.opening = null; }).catch(() => {});
    return operation;
  }
  private restore(focus: boolean) {
    const owner = this.deps.owner();
    if (!owner || owner.isDestroyed()) return;
    if (owner.isMinimized()) owner.restore();
    if (this.previous) {
      if (this.previous.maximized) owner.maximize();
      else { if (owner.isMaximized()) owner.unmaximize(); owner.setBounds(this.previous.bounds); }
    }
    if (focus) { owner.show(); owner.focus(); } else owner.showInactive();
    this.previous = null;
  }
  back(focus = true) {
    const w = this.window, wasActive = this.active || !!w;
    this.window = null; this.active = false;
    this.ready?.reject(Error('오버레이 전환이 취소되었습니다.')); this.ready = null;
    if (w && !w.isDestroyed()) { this.deps.writePosition(w.getBounds()); w.destroy(); }
    if (wasActive) this.restore(focus);
    this.deps.changed();
  }
  invalidate() {
    this.snapshot = null; this.receivedAt = 0;
    for (const id of this.pending.keys()) this.finish(id, { ok: false, message: '이전 측정 화면의 명령이 취소되었습니다.' });
    this.completed.clear(); this.back(false);
  }
  shutdown() {
    this.previous = null;
    this.ready?.reject(Error('앱이 종료되었습니다.')); this.ready = null;
    for (const id of this.pending.keys()) this.finish(id, { ok: false });
    const w = this.window; this.window = null; this.active = false; w?.destroy();
  }
}
