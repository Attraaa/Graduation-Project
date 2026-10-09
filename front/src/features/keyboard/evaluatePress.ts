import type {
  FingerCandidate,
  FingerEvaluation,
  FingerEvaluationOptions,
  FingerId,
  FingerPolicy,
  FingerEvaluationReason,
  KeyboardPressObservation,
} from './types';

const fingerId = (candidate: FingerCandidate): FingerId =>
  `${candidate.hand}:${candidate.finger}`;

const unknown = (
  observation: KeyboardPressObservation,
  policy: FingerPolicy,
  reason: FingerEvaluationReason,
  preferred: readonly FingerId[] = [],
  acceptable: readonly FingerId[] = [],
): FingerEvaluation => ({
  code: observation.code,
  verdict: 'unknown',
  reason,
  observed: null,
  preferred,
  acceptable,
  confidence: null,
  policyId: policy.id,
  policyVersion: policy.version,
});

/**
 * Apply Moti's coaching policy to perception-only candidate data.
 * Thresholds are required from the caller because they must be calibrated
 * against labelled camera recordings rather than hidden in this module.
 */
export function evaluatePress(
  observation: KeyboardPressObservation,
  policy: FingerPolicy,
  options: FingerEvaluationOptions,
): FingerEvaluation {
  const rule = policy.keys[observation.code];
  if (!rule) return unknown(observation, policy, 'unsupported-key');

  if (!observation.manualGeometryValidated && (!Number.isFinite(observation.keyboardConfidence)
      || observation.keyboardConfidence < options.minKeyboardConfidence)) {
    return unknown(
      observation,
      policy,
      'low-keyboard-confidence',
      rule.preferred,
      rule.acceptable,
    );
  }

  if (observation.frameDeltaMs === null
      || !Number.isFinite(observation.frameDeltaMs)
      || Math.abs(observation.frameDeltaMs) > options.maxAbsoluteFrameDeltaMs) {
    return unknown(observation, policy, 'invalid-frame-timing', rule.preferred, rule.acceptable);
  }

  const candidates = observation.candidates
    .filter(candidate => Number.isFinite(candidate.confidence)
      && candidate.confidence >= options.minFingerConfidence
      && candidate.confidence <= 1
      && Number.isFinite(candidate.normalizedDistanceToTarget)
      && candidate.normalizedDistanceToTarget >= 0)
    .toSorted((left, right) => {
      if (left.insideTarget !== right.insideTarget) return left.insideTarget ? -1 : 1;
      const distance = left.normalizedDistanceToTarget - right.normalizedDistanceToTarget;
      return distance || right.confidence - left.confidence;
    }).filter((candidate, index, sorted) => sorted.findIndex(other => fingerId(other) === fingerId(candidate)) === index);

  const best = candidates[0];
  if (!best) {
    return unknown(observation, policy, 'no-reliable-candidate', rule.preferred, rule.acceptable);
  }
  if (!best.insideTarget
      && best.normalizedDistanceToTarget > options.maxNormalizedDistanceToTarget) {
    return unknown(observation, policy, 'candidate-too-far', rule.preferred, rule.acceptable);
  }

  const second = candidates[1];
  if (second
      && second.insideTarget === best.insideTarget
      && Math.abs(second.normalizedDistanceToTarget - best.normalizedDistanceToTarget)
        <= options.ambiguityNormalizedDistance) {
    return unknown(observation, policy, 'ambiguous-candidates', rule.preferred, rule.acceptable);
  }

  const observed = fingerId(best);
  const confidence = observation.manualGeometryValidated ? best.confidence : Math.min(observation.keyboardConfidence, best.confidence);
  if (rule.preferred.includes(observed)) {
    return {
      code: observation.code,
      verdict: 'preferred',
      reason: 'preferred-finger',
      observed,
      preferred: rule.preferred,
      acceptable: rule.acceptable,
      confidence,
      policyId: policy.id,
      policyVersion: policy.version,
    };
  }
  if (rule.acceptable.includes(observed)) {
    return {
      code: observation.code,
      verdict: 'acceptable',
      reason: 'acceptable-alternative',
      observed,
      preferred: rule.preferred,
      acceptable: rule.acceptable,
      confidence,
      policyId: policy.id,
      policyVersion: policy.version,
    };
  }
  // Thumb opposition is not an adjacent typing finger. Never forgive a hand swap.
  const order = ['index', 'middle', 'ring', 'pinky'];
  const nearby = [...rule.preferred, ...rule.acceptable].some(expected => {
    const [hand, finger] = expected.split(':');
    return hand === best.hand && order.includes(best.finger) && order.includes(finger)
      && Math.abs(order.indexOf(finger) - order.indexOf(best.finger)) === 1;
  });
  return {
    code: observation.code,
    verdict: nearby ? 'nearby' : 'mismatch',
    reason: nearby ? 'neighboring-finger' : 'different-finger',
    observed,
    preferred: rule.preferred,
    acceptable: rule.acceptable,
    confidence,
    policyId: policy.id,
    policyVersion: policy.version,
  };
}
