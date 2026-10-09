import { normalizeKeyboardCamera, type KeyboardCamera } from '../keyboard/camera.ts';
import { normalizeFraming, type CameraFraming } from './framing.ts';

export type Point = [number, number];
export type Quad = [Point, Point, Point, Point]; // clockwise outer boundary, normalized image coordinates
export interface GridSettings { source: 'automatic' | 'manual'; quad: Quad; flipX: boolean; flipY: boolean; turns: number }
export interface CameraProfile extends KeyboardCamera, CameraFraming {
  flipX: boolean; flipY: boolean;
  exposureMode: string; exposure: number | null;
  grid: GridSettings; // saved boundary in oriented/cropped image coordinates before zoom/pan
}
export const defaultQuad = (): Quad => [[.08, .3], [.92, .3], [.92, .8], [.08, .8]];
export function validQuad(value: unknown, minimumArea = .015): value is Quad {
  if (!Array.isArray(value) || value.length !== 4 || value.some(p => !Array.isArray(p) || p.length !== 2 || p.some(n => !Number.isFinite(n) || n < 0 || n > 1))) return false;
  const cross = value.map((p, i) => {
    const b = value[(i + 1) % 4], c = value[(i + 2) % 4];
    return (b[0] - p[0]) * (c[1] - b[1]) - (b[1] - p[1]) * (c[0] - b[0]);
  });
  const area = Math.abs(value.reduce((sum, p, i) => sum + p[0] * value[(i + 1) % 4][1] - p[1] * value[(i + 1) % 4][0], 0)) / 2;
  return cross.every(n => n > minimumArea / 150) && area >= minimumArea;
}
export function normalizeProfile(value: unknown, mode: string): CameraProfile {
  const input = value && typeof value === 'object' ? value as Partial<CameraProfile> : {};
  const grid = input.grid;
  return { ...normalizeKeyboardCamera(input), ...normalizeFraming(input), flipX: typeof input.flipX === 'boolean' ? input.flipX : mode !== 'keyboard', flipY: input.flipY === true,
    exposureMode: typeof input.exposureMode === 'string' ? input.exposureMode : '',
    exposure: typeof input.exposure === 'number' && Number.isFinite(input.exposure) ? input.exposure : null,
    grid: { source: grid?.source === 'manual' ? 'manual' : 'automatic', quad: validQuad(grid?.quad, .015 / 25) ? grid.quad : defaultQuad(),
      flipX: grid?.flipX === true, flipY: grid?.flipY === true, turns: Number.isInteger(grid?.turns) ? ((grid!.turns % 4) + 4) % 4 : 0 } };
}
const key = (mode: string, device: string) => `moti.camera.v1:${encodeURIComponent(mode)}:${encodeURIComponent(device)}`;
export function readProfile(storage: Storage, mode: string, device: string): CameraProfile {
  try { return normalizeProfile(JSON.parse(storage.getItem(key(mode, device)) ?? '{}'), mode); }
  catch { return normalizeProfile({}, mode); }
}
export function writeProfile(storage: Storage, mode: string, device: string, profile: CameraProfile) {
  if (device) storage.setItem(key(mode, device), JSON.stringify(normalizeProfile(profile, mode)));
}
export function resolveProfile(storage: Storage, mode: string, device: string): CameraProfile {
  // The old global keyboard profile is claimed by the first actual keyboard camera only.
  if (mode === 'keyboard' && device && !storage.getItem('moti.camera.legacyMigrated')) {
    const legacy = storage.getItem('moti.keyboard.camera');
    if (legacy && !storage.getItem(key(mode, device))) {
      try { writeProfile(storage, mode, device, normalizeProfile(JSON.parse(legacy), mode)); } catch { /* malformed legacy profile */ }
    }
    storage.setItem('moti.camera.legacyMigrated', device);
  }
  return readProfile(storage, mode, device);
}
export const imageSignature = (profile: CameraProfile) => JSON.stringify([profile.left, profile.top, profile.width, profile.height, profile.angle, profile.flipX, profile.flipY, profile.brightness, profile.contrast, profile.zoom, profile.panX, profile.panY]);
