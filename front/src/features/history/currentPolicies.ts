import { RECOGNITION_VERSION } from '../../../../database/keyboard.ts';
import type { EntrySource } from '../dashboard/summary.ts';
import { eyePolicy } from '../eye/eyePolicy.ts';
import { ANSI_QWERTY_TOUCH_POLICY_V1 } from '../keyboard/fingerPolicy.ts';
import { HABIT_POLICY } from '../posture/evaluation.ts';
import { shoulderScorePolicy } from '../posture/modes/shoulder.ts';
import { turtleScorePolicy } from '../posture/modes/turtle.ts';

/** Versions the app writes into new records today. Anything else was measured with an earlier standard. */
export const CURRENT_POLICIES = {
  turtle: turtleScorePolicy.version,
  shoulder: shoulderScorePolicy.version,
  habit: HABIT_POLICY.version,
  eye: eyePolicy.version,
  keyboard: `${ANSI_QWERTY_TOUCH_POLICY_V1.id}:${ANSI_QWERTY_TOUCH_POLICY_V1.version}`,
  recognition: RECOGNITION_VERSION,
};

/** "이전 기준": the row was measured with a policy the app no longer writes. */
export function isLegacy(source: EntrySource) {
  if (source.mode === 'eye') return source.record.policyVersion !== CURRENT_POLICIES.eye;
  if (source.mode === 'keyboard') {
    return source.stored.record.policyVersion !== CURRENT_POLICIES.keyboard
      || source.stored.record.recognitionVersion !== CURRENT_POLICIES.recognition;
  }
  return source.records.some(record => record.habitPolicyVersion !== CURRENT_POLICIES.habit
    || record.scorePolicyVersion !== (record.mode === 'turtle' ? CURRENT_POLICIES.turtle : CURRENT_POLICIES.shoulder));
}
