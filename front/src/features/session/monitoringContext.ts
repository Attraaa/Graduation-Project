import { createContext, useContext } from 'react';
import type { CameraContextValue } from '../camera/context';
import type { MonitorSnapshot } from '../posture/monitorTypes';
import type { EyeUpdate } from '../eye/EyeMonitor';
import type { KeyboardMonitorSnapshot } from '../keyboard/monitorTypes';
import type { useSessionControls } from './useSessionControls';
import type { TrendPoint } from './trend';

export type MonitoringMode = 'upper_body' | 'keyboard';
type Session = {
  controls: ReturnType<typeof useSessionControls>;
  camera: CameraContextValue;
  start: () => void;
  trend: TrendPoint[];
};
export interface MonitoringState {
  upper: Session & { snapshot: MonitorSnapshot; eye: EyeUpdate; recalibrate: () => void };
  keyboard: Session & { snapshot: KeyboardMonitorSnapshot; remap: () => void };
}
export const MonitoringContext = createContext<MonitoringState | null>(null);
export function useMonitoring() {
  const state = useContext(MonitoringContext);
  if (!state) throw new Error('Monitoring requires the application session provider');
  return state;
}
