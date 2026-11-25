import type { EntrySource } from '../dashboard/summary.ts';
import { eyePolicy, isCurrentEyePolicy } from '../eye/eyePolicy.ts';
import { ANSI_QWERTY_TOUCH_POLICY_V1 } from '../keyboard/fingerPolicy.ts';
import { HABIT_POLICY } from '../posture/evaluation.ts';
import { balanceScorePolicy, isCurrentBalancePolicy } from '../posture/modes/balance.ts';
import { turtleScorePolicy } from '../posture/modes/turtle.ts';

/** Versions the app writes into new records today. Anything else was measured with an earlier standard. */
export const CURRENT_POLICIES = {
  turtle: turtleScorePolicy.version,
  balance: balanceScorePolicy.version,
  habit: HABIT_POLICY.version,
  eye: eyePolicy.version,
  keyboard: `${ANSI_QWERTY_TOUCH_POLICY_V1.id}:${ANSI_QWERTY_TOUCH_POLICY_V1.version}`,
  // Same literal as beginKeyboardRecording in keyboard/recording.ts, which no longer writes RECOGNITION_VERSION.
  recognition: 'hands-camera-manual-v3',
};

/**
 * "이전 기준": the row's score was measured with a policy the app no longer writes. The balance score is current at any
 * of its sensitivities. The 기준에서 벗어남 rule is not a standard here: it follows the alert setting (2026-11-25) and each
 * row keeps the rule it was counted with, so an older or different rule does not mark the row.
 */
export function isLegacy(source: EntrySource) {
  if (source.mode === 'eye') return !isCurrentEyePolicy(source.record.policyVersion);
  if (source.mode === 'keyboard') {
    return source.stored.record.policyVersion !== CURRENT_POLICIES.keyboard
      || source.stored.record.recognitionVersion !== CURRENT_POLICIES.recognition;
  }
  return source.records.some(record =>
    record.mode === 'turtle' ? record.scorePolicyVersion !== CURRENT_POLICIES.turtle : !isCurrentBalancePolicy(record.scorePolicyVersion));
}
