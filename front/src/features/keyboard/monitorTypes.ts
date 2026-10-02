import type { KeyboardLiveResult } from './runtime'
import type { KeyboardCount } from '../../../../database/keyboard'

export type KeyboardMonitorPhase = 'idle' | 'starting' | 'mapping' | 'ready' | 'error'

export interface KeyboardMonitorSnapshot {
  phase: KeyboardMonitorPhase
  message: string | null
  detectedPresses: number
  latest: KeyboardLiveResult | null
  recent: KeyboardLiveResult[]
  counts: KeyboardCount[]
  observationStatus: 'off' | 'observing' | 'excluded' | 'error'
}

export const initialKeyboardSnapshot: KeyboardMonitorSnapshot = {
  phase: 'idle',
  message: null,
  detectedPresses: 0,
  latest: null,
  recent: [],
  counts: [],
  observationStatus: 'off',
}
