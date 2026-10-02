/** 실험용 설정. 가중치는 각 부위별 합이 1이 되게 조정합니다 (자동 정규화 없음).
 * 의료 기준이 아닙니다. 수정 후 새 측정을 시작하세요. 설정 변경은 저장 정책 ID에도 반영됩니다.
 */
export const NECK_WEIGHTS = Object.freeze({ headForward: 0.35, torsoForward: 0.25, neckSlump: 0.4 });
export const SHOULDER_WEIGHTS = Object.freeze({ shoulderTilt: 0.7, shoulderShrug: 0.3 });
export const NECK_LIMITS = Object.freeze({ fullCreditDelta: 0.04, zeroCreditDelta: 0.20 });
export const SHOULDER_LIMITS = Object.freeze({ fullCreditDelta: 0.03, zeroCreditDelta: 0.18 });
export const YAW_LIMIT = 0.15;
export const MOTION_PROTECTION = Object.freeze({
  velocityPxPerSecond: 250,
  graceMs: 2000,
  penaltyPointsPerSecond: 35,
});

/** Keep experimental settings out of averages recorded under different settings. */
export function scoreSettingsVersion(part: 'neck' | 'shoulder', weights: object, limits: object) {
  const text = JSON.stringify({ weights, limits, yaw: YAW_LIMIT, motion: MOTION_PROTECTION });
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `upper-body-${part}-v2-${(hash >>> 0).toString(36)}`;
}
