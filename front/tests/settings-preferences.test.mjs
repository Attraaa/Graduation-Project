import assert from 'node:assert/strict';
import test from 'node:test';
import { UPPER_MEASUREMENT } from '../src/features/settings/preferences.ts';
import { balancePolicy } from '../src/features/posture/modes/balance.ts';

test('upper-body measurement uses a fixed 10% balance policy, 50° CVA and normal blink sensitivity', () => {
  assert.deepEqual(UPPER_MEASUREMENT, { balanceSensitivity: 10, baseCva: 50, eyeSensitivity: 'normal' });
  const policy = balancePolicy(UPPER_MEASUREMENT.balanceSensitivity);
  assert.match(policy.version, /:s10$/);
  assert.deepEqual([policy.fullDeg, policy.zeroDeg], [4.2, 25.2]);
});
