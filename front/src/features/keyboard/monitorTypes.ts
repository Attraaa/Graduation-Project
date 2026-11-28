import type { KeyboardLiveResult } from './runtime'
import type { KeyboardCount, KeyboardInputQuality } from '../../../../database/keyboard'

export type KeyboardMonitorPhase = 'idle' | 'starting' | 'mapping' | 'ready' | 'error'
/**
 * Finding the keyboard: trying = automatic recognition is looking, found = it found the keyboard,
 * waiting = it failed and the area was switched to manual, so judging waits until the user fits the area,
 * manual = the area the user fitted is in use.
 */
export type KeyboardRecognition = 'off' | 'trying' | 'found' | 'waiting' | 'manual'

export interface KeyboardMonitorSnapshot {
  phase: KeyboardMonitorPhase
  message: string | null
  recognition: KeyboardRecognition
  detectedPresses: number
  latest: KeyboardLiveResult | null
  recent: KeyboardLiveResult[]
  /** Scores of the last 50 judged presses (liveScore.ts). Explicit position recapture clears this window. */
  scores: number[]
  counts: KeyboardCount[]
  quality?: KeyboardInputQuality
  observationStatus: 'off' | 'observing' | 'excluded' | 'error'
}

export const initialKeyboardSnapshot: KeyboardMonitorSnapshot = {
  phase: 'idle',
  message: null,
  recognition: 'off',
  detectedPresses: 0,
  latest: null,
  recent: [],
  scores: [],
  counts: [],
  observationStatus: 'off',
}
