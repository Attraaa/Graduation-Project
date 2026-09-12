export type Hand = 'left' | 'right';
export type Finger = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
export type FingerId = `${Hand}:${Finger}`;

export interface KeyFingerRule {
  preferred: readonly FingerId[];
  acceptable: readonly FingerId[];
}

export interface FingerPolicy {
  id: string;
  version: string;
  layout: string;
  keys: Readonly<Record<string, KeyFingerRule>>;
}

/** One candidate observed near the physical key at the key-press time. */
export interface FingerCandidate {
  hand: Hand;
  finger: Finger;
  confidence: number;
  /** Distance divided by the target key width. */
  normalizedDistanceToTarget: number;
  insideTarget: boolean;
}

/** Perception-only data supplied by the local keyboard analysis process. */
export interface KeyboardPressObservation {
  /** Physical KeyboardEvent.code, such as KeyQ, independent of input language. */
  code: string;
  keyboardConfidence: number;
  frameDeltaMs: number | null;
  candidates: readonly FingerCandidate[];
}

export interface FingerEvaluationOptions {
  minKeyboardConfidence: number;
  minFingerConfidence: number;
  maxAbsoluteFrameDeltaMs: number;
  maxNormalizedDistanceToTarget: number;
  ambiguityNormalizedDistance: number;
}

export type FingerVerdict = 'preferred' | 'acceptable' | 'mismatch' | 'unknown';

export type FingerEvaluationReason =
  | 'preferred-finger'
  | 'acceptable-alternative'
  | 'different-finger'
  | 'unsupported-key'
  | 'low-keyboard-confidence'
  | 'invalid-frame-timing'
  | 'no-reliable-candidate'
  | 'candidate-too-far'
  | 'ambiguous-candidates';

export interface FingerEvaluation {
  code: string;
  verdict: FingerVerdict;
  reason: FingerEvaluationReason;
  observed: FingerId | null;
  preferred: readonly FingerId[];
  acceptable: readonly FingerId[];
  confidence: number | null;
  policyId: string;
  policyVersion: string;
}
