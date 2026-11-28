import { createContext, useContext } from 'react';
import type { CameraProfile, GridSettings } from './profile.ts';

export interface CameraRuntime {
  profile: CameraProfile;
  canvas: HTMLCanvasElement | null;
  overlay: HTMLCanvasElement | null;
  track: MediaStreamTrack | null;
  video: HTMLVideoElement | null;
  stream: MediaStream | null;
  paused: boolean;
  deviceId: string;
  editing: boolean;
  generation: number;
  frameGeneration: number | null;
  frameAt: number | null;
  videoTime: number;
  metrics: { encodingMs: number; roundTripMs: number; inferenceMs: number; resultAgeMs: number } | null;
  invalidate: (() => void) | null;
  /** Keyboard: automatic recognition failed and switched to manual; nothing is judged until the user fits the area. */
  manualPending: boolean;
}
export interface CameraContextValue {
  modeId: string; cameraLabel: string; profile: CameraProfile; connected: boolean;
  runtime: { current: CameraRuntime };
  update: (change: Partial<CameraProfile>) => void;
  setGrid: (grid: GridSettings) => void; // accepts current displayed/analysis image coordinates
  setEditing: (editing: boolean) => void;
  reportMetrics: (metrics: CameraRuntime['metrics']) => void;
  setInvalidator: (callback: (() => void) | null) => void;
  setManualPending: (pending: boolean) => void;
  connect: (video: HTMLVideoElement, stream: MediaStream, canvas: HTMLCanvasElement, overlay?: HTMLCanvasElement | null) => Promise<void>;
  detach: () => void;
  open: () => void;
  exposureError: string | null;
  storageError: string;
}
export const CameraContext = createContext<CameraContextValue | null>(null);
export function useCameraSettings() {
  const context = useContext(CameraContext);
  if (!context) throw new Error('Camera settings require CameraProvider');
  return context;
}
