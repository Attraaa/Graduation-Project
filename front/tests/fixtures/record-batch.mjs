import { emptyTotals, AGGREGATION_VERSION } from '../../../database/contracts.ts';

export const sampleBatch = () => ({ schemaVersion: 1, aggregationPolicyVersion: AGGREGATION_VERSION, generation: 0, sequence: 0,
  record: { ...emptyTotals(), id: 'one', owner: 'demo', mode: 'turtle', startedAt: 1800000000000, updatedAt: 1800000000000, offsetMinutes: -540,
    scorePolicyVersion: 'turtle-v1', habitPolicyVersion: 'habit-v1', longestContinuousMs: 0, status: 'running' }, buckets: [] });
