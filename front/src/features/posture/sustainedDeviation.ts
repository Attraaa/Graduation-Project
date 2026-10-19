import type { PostureDeltas } from './observation.ts';
import type { ScorePolicy } from './scoring.ts';
import { NECK_SUSTAINED } from './scoreSettings.ts';

export interface SustainedDeviation {
  continuousMs: number;
  penaltyPoints: number;
  recoveryMs: number;
  qualifying: boolean;
  recovering: boolean;
}

export const createSustainedDeviation = (): SustainedDeviation => ({
  continuousMs: 0, penaltyPoints: 0, recoveryMs: 0, qualifying: false, recovering: false,
});

/** 누락/움직임/일시정지는 연속 시간만 끊고, 이미 받은 감점은 복귀 확인까지 보존합니다. */
export const interruptSustainedDeviation = (previous: SustainedDeviation): SustainedDeviation => ({
  ...createSustainedDeviation(), penaltyPoints: previous.penaltyPoints,
});

/** 유효하고 정지한 관측만 전달합니다. elapsedMs는 벽시계가 아닌 연속 관측 간격입니다. */
export function advanceSustainedDeviation(
  previous: SustainedDeviation, delta: PostureDeltas, policy: ScorePolicy, elapsedMs: number, roundingMs: number,
): SustainedDeviation {
  if (policy.mode !== 'turtle') return createSustainedDeviation();
  const settings = NECK_SUSTAINED;
  const geometry = delta.headForward * (policy.weights.headForward ?? 0) + delta.neckSlump * (policy.weights.neckSlump ?? 0);
  const qualifying = delta.headForward >= settings.minHeadForward && geometry >= settings.minGeometryDeviation;
  const recovering = delta.headForward <= settings.recoveryHeadForward || geometry <= settings.recoveryGeometryDeviation;
  const continuousMs = qualifying && previous.qualifying ? previous.continuousMs + elapsedMs : 0;
  const recoveryMs = recovering && previous.recovering ? previous.recoveryMs + elapsedMs : 0;
  const addedMs = Math.max(0, continuousMs - settings.delayMs) - Math.max(0, previous.continuousMs - settings.delayMs);
  const penaltyPoints = recovering && recoveryMs + roundingMs >= settings.recoveryMs ? 0
    : Math.min(100, previous.penaltyPoints + Math.max(0, addedMs) * settings.pointsPerSecond / 1000);
  return { continuousMs, penaltyPoints, recoveryMs, qualifying, recovering };
}
