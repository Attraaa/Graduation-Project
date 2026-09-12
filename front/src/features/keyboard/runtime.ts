import { evaluatePress } from './evaluatePress.ts'
import { ANSI_QWERTY_TOUCH_POLICY_V1 } from './fingerPolicy.ts'
import type {
  Finger,
  FingerCandidate,
  FingerEvaluation,
  FingerEvaluationOptions,
  FingerId,
  Hand,
} from './types'

export interface RuntimeFingerPoint {
  hand: string
  finger: string
  x: number
  y: number
  score: number
  key?: string | null
  matches_pressed_key?: boolean
  distance_to_pressed_key_center?: number | null
}

export interface RuntimeKeyboardMapping {
  ok: boolean
  reason?: string | null
  keys: Record<string, number[][]>
  quality?: { min_confidence?: number }
  size?: [number, number]
  mode?: string
}

export interface RuntimePressPayload {
  ok: boolean
  key_event: { key: string; code?: string | null; sequence: number }
  frame_sequence?: number | null
  frame_delta_ms?: number | null
  pressed_key?: string | null
  pressed_finger?: RuntimeFingerPoint | null
  finger_keys?: RuntimeFingerPoint[]
  keyboard?: RuntimeKeyboardMapping
  error?: string | null
}

export interface KeyboardLiveResult {
  id: number
  code: string
  pressedKey: string
  observedFinger: FingerId | null
  evaluation: FingerEvaluation
  frameDeltaMs: number | null
  error: string | null
}

export const PROVISIONAL_KEYBOARD_THRESHOLDS: FingerEvaluationOptions = {
  minKeyboardConfidence: 0.18,
  minFingerConfidence: 0.45,
  maxAbsoluteFrameDeltaMs: 180,
  maxNormalizedDistanceToTarget: 0.9,
  ambiguityNormalizedDistance: 0.12,
}

const hands = new Set<Hand>(['left', 'right'])
const fingers = new Set<Finger>(['thumb', 'index', 'middle', 'ring', 'pinky'])

const toFingerId = (point: RuntimeFingerPoint | null | undefined): FingerId | null => {
  if (!point) return null
  const hand = point.hand.toLowerCase() as Hand
  const finger = point.finger.toLowerCase() as Finger
  return hands.has(hand) && fingers.has(finger) ? `${hand}:${finger}` : null
}

const sameKey = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase()

const targetKeyWidth = (mapping: RuntimeKeyboardMapping | undefined, pressedKey: string) => {
  const entry = Object.entries(mapping?.keys ?? {}).find(([name]) => sameKey(name, pressedKey))
  const polygon = entry?.[1]
  if (!polygon || polygon.length < 4) return null
  const distance = (a: number[], b: number[]) => Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0))
  const width = (distance(polygon[0], polygon[1]) + distance(polygon[2], polygon[3])) / 2
  return Number.isFinite(width) && width > 0 ? width : null
}

export function adaptRuntimePress(payload: RuntimePressPayload): KeyboardLiveResult {
  const code = payload.key_event.code ?? ''
  const pressedKey = payload.pressed_key ?? payload.key_event.key
  const width = targetKeyWidth(payload.keyboard, pressedKey)
  const candidates: FingerCandidate[] = (payload.finger_keys ?? []).flatMap(point => {
    const id = toFingerId(point)
    const distance = point.distance_to_pressed_key_center
    if (!id || width === null || distance === null || distance === undefined) return []
    const [hand, finger] = id.split(':') as [Hand, Finger]
    return [{
      hand,
      finger,
      confidence: point.score,
      normalizedDistanceToTarget: distance / width,
      insideTarget: Boolean(point.matches_pressed_key),
    }]
  })
  const evaluation = evaluatePress({
    code,
    keyboardConfidence: payload.keyboard?.quality?.min_confidence ?? 0,
    frameDeltaMs: payload.frame_delta_ms ?? null,
    candidates,
  }, ANSI_QWERTY_TOUCH_POLICY_V1, PROVISIONAL_KEYBOARD_THRESHOLDS)

  return {
    id: payload.key_event.sequence,
    code,
    pressedKey,
    observedFinger: toFingerId(payload.pressed_finger),
    evaluation,
    frameDeltaMs: payload.frame_delta_ms ?? null,
    error: payload.error ?? null,
  }
}
