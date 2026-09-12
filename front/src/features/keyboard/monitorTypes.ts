import type { KeyboardLiveResult } from './runtime'

export type KeyboardMonitorPhase = 'idle' | 'starting' | 'mapping' | 'ready' | 'error'

export interface KeyboardMonitorSnapshot {
  phase: KeyboardMonitorPhase
  message: string | null
  detectedPresses: number
  latest: KeyboardLiveResult | null
  recent: KeyboardLiveResult[]
}

export const initialKeyboardSnapshot: KeyboardMonitorSnapshot = {
  phase: 'idle',
  message: null,
  detectedPresses: 0,
  latest: null,
  recent: [],
}
