export const OVERLAY_MODES = ['upper_body', 'keyboard'] as const;
export type OverlayMode = typeof OVERLAY_MODES[number];
export type OverlayAction = 'start' | 'pause' | 'resume' | 'stop';
export interface OverlaySession {
  run: number;
  running: boolean;
  paused: boolean;
  seconds: number;
  status: string;
  detail: string;
  error: boolean;
}
export interface OverlaySnapshot {
  owner: string;
  sequence: number;
  theme: 'light' | 'dark';
  upper_body: OverlaySession;
  keyboard: OverlaySession;
  savingFailed: boolean;
}
export interface OverlayView { snapshot: OverlaySnapshot | null; connected: boolean }
export interface OverlayCommand { id: string; owner: string; mode: OverlayMode; run: number; action: OverlayAction }
export interface OverlayResult { ok: boolean; message?: string }

const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const short = (value: unknown, max = 120): value is string => typeof value === 'string' && value.length <= max;
export function parseOverlaySnapshot(input: unknown): OverlaySnapshot {
  if (!input || typeof input !== 'object') throw Error('잘못된 오버레이 상태입니다.');
  const s = input as OverlaySnapshot;
  if (!short(s.owner, 80) || !s.owner || !integer(s.sequence) || !['light', 'dark'].includes(s.theme) || typeof s.savingFailed !== 'boolean') throw Error('잘못된 오버레이 상태입니다.');
  const session = (mode: OverlayMode): OverlaySession => {
    const v = s[mode];
    if (!v || !integer(v.run) || typeof v.running !== 'boolean' || typeof v.paused !== 'boolean' || (v.paused && !v.running)
      || typeof v.seconds !== 'number' || !Number.isFinite(v.seconds) || v.seconds < 0 || v.seconds > 1e9
      || !short(v.status, 60) || !short(v.detail) || typeof v.error !== 'boolean') throw Error('잘못된 오버레이 상태입니다.');
    return { run: v.run, running: v.running, paused: v.paused, seconds: v.seconds, status: v.status, detail: v.detail, error: v.error };
  };
  return { owner: s.owner, sequence: s.sequence, theme: s.theme, savingFailed: s.savingFailed, upper_body: session('upper_body'), keyboard: session('keyboard') };
}
export function parseOverlayCommand(input: unknown): OverlayCommand {
  if (!input || typeof input !== 'object') throw Error('잘못된 측정 명령입니다.');
  const c = input as OverlayCommand;
  if (!short(c.id, 80) || !c.id || !short(c.owner, 80) || !c.owner || !OVERLAY_MODES.includes(c.mode) || !integer(c.run)
    || !['start', 'pause', 'resume', 'stop'].includes(c.action)) throw Error('잘못된 측정 명령입니다.');
  return { id: c.id, owner: c.owner, mode: c.mode, run: c.run, action: c.action };
}
export function commandAllowed(session: Pick<OverlaySession, 'running' | 'paused'>, action: OverlayAction) {
  return action === 'start' ? !session.running : action === 'pause' ? session.running && !session.paused
    : action === 'resume' ? session.running && session.paused : session.running;
}
export const overlayTime = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60].map(n => String(n).padStart(2, '0')).join(':');
};
