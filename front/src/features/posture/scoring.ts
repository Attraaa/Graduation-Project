import type { PostureDeltas } from './observation.ts';
import { SHOULDER_VERTICAL_GAIN, YAW_LIMIT } from './scoreSettings.ts';

/**
 * [역할: 한 번의 변화량을 0~100 원점수로 환산]
 * observation.ts의 delta와 목/어깨 정책(policy)을 받아 계산합니다.
 * 원점수는 시간 보호를 적용하기 전 값입니다. 화면에 표시할 점수는 evaluation.ts가 정합니다.
 */
export type PostureMode = 'turtle' | 'shoulder';
// yawRatio는 점수 감점 항목에 포함하지 않고, 측정 가능 여부를 검사할 때 사용합니다.
export type ScoreMetric = Exclude<keyof PostureDeltas, 'yawRatio'>;

// modes/turtle.ts와 modes/shoulder.ts가 scoreSettings.ts 설정으로 각각의 정책을 만듭니다.
export interface ScorePolicy {
  readonly version: string;
  readonly mode: PostureMode;
  readonly weights: Readonly<Partial<Record<ScoreMetric, number>>>;
  readonly fullCreditDelta: number;
  readonly zeroCreditDelta: number;
}

export interface PostureScore {
  scorePolicyVersion: string;
  // null은 판정 불가입니다. 실제로 계산한 최저 점수 0과 구분합니다.
  score: number | null;
  // 각 변화량에 비중을 곱해 합친 값. 화면의 "가중 편차"가 이 값입니다.
  deviation: number | null;
}

/** 세션 기준과의 화면상 유사도를 계산합니다. 건강이나 올바른 자세를 진단하는 함수는 아닙니다. */
export function scorePosture(delta: PostureDeltas | null, policy: ScorePolicy): PostureScore {
  const unknown = { scorePolicyVersion: policy.version, score: null, deviation: null };
  if (delta === null) return unknown;
  // observation.ts를 거치지 않고 호출해도 회전·잘못된 yaw 값이 점수로 계산되지 않게 검사합니다.
  if (!Number.isFinite(delta.yawRatio) || delta.yawRatio < 0 || delta.yawRatio > YAW_LIMIT) return unknown;

  let deviation = 0;
  // 정책에 포함된 항목만 계산합니다. 목 정책은 어깨 항목을, 어깨 정책은 목 항목을 사용하지 않습니다.
  for (const [metric, weight] of Object.entries(policy.weights) as [ScoreMetric, number][]) {
    if (!Number.isFinite(weight) || weight < 0) return unknown;
    if (weight === 0) continue;
    if (!Number.isFinite(delta[metric]) || delta[metric] < 0) return unknown;
    const gain = policy.mode === 'shoulder' && metric === 'shoulderShrug' ? SHOULDER_VERTICAL_GAIN : 1;
    // 가중 편차 = Σ(변화량 × 가중치 × 추가 감도). 숫자가 클수록 기준에서 더 벗어난 것입니다.
    deviation += weight * delta[metric] * gain;
  }

  // 허용 범위 안: 100점 / 크게 벗어남: 0점 / 중간: 직선 비례로 계산합니다.
  // 예: 어깨 편차 0.105 → 100 × (0.18 - 0.105) / (0.18 - 0.03) = 50점.
  const score = deviation <= policy.fullCreditDelta ? 100
    : deviation >= policy.zeroCreditDelta ? 0
      : 100 * (policy.zeroCreditDelta - deviation) / (policy.zeroCreditDelta - policy.fullCreditDelta);
  // 여기서는 반올림하지 않습니다. 소수점을 보존해 평균을 계산하고 화면에서만 반올림합니다.
  return { scorePolicyVersion: policy.version, score, deviation };
}
