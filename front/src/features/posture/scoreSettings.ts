/**
 * [역할: 점수 규칙의 숫자 설정]
 * observation.ts가 측정값을 만들고, scoring.ts와 evaluation.ts가 여기의 숫자를 사용합니다.
 * 감도·100점 범위·감점 속도·대기 시간을 조절할 때 먼저 보는 파일입니다.
 * 실험용 제품 설정이며 의료 기준은 아닙니다. 수정 후 새 측정을 시작하세요.
 */
// 가중치 = 각 변화가 점수에 얼마나 영향을 주는지 정하는 비중입니다(목 점수는 modes/turtle.ts의 E19 모델).
// 어깨: 양어깨 기울기 70%, 귀-어깨 간격의 상하 변화 30%. 기본 가중치 합은 1이며 자동으로 맞춰 주지는 않습니다.
export const SHOULDER_WEIGHTS = Object.freeze({ shoulderTilt: 0.7, shoulderShrug: 0.3 });
// 여러 변화를 가중합한 편차가 fullCreditDelta 이하면 100점, zeroCreditDelta 이상이면 0점.
// 두 경계 사이는 scoring.ts에서 직선 비례로 환산합니다. 0.03은 3도나 3cm가 아닙니다.
export const SHOULDER_LIMITS = Object.freeze({ fullCreditDelta: 0.03, zeroCreditDelta: 0.18 });
// 어깨 상하 변화 항만 25% 강화합니다. 기울기 항에는 곱하지 않습니다.
export const SHOULDER_VERTICAL_GAIN = 1.25;
// 코가 양 귀의 중점에서 얼마나 옆으로 벗어났는지 / 귀 폭. 0.15는 회전 각도가 아닙니다.
// 이 비율을 넘으면 귀 좌표 비교를 믿기 어려워 목·어깨 모두 판정을 보류합니다.
export const YAW_LIMIT = 0.15;
// Object.freeze는 실행 중 설정 객체가 다른 코드에 의해 바뀌지 않도록 막습니다.
export const MOTION_PROTECTION = Object.freeze({
  // 귀·어깨 중 한 점이라도 초당 250픽셀을 넘게 움직이면 마지막 점수를 유지합니다.
  velocityPxPerSecond: 250,
  // 멈춘 뒤 기준에서 벗어난 상태가 이어져도 처음 2초는 감점을 기다립니다.
  graceMs: 2000,
  // 낮아진 점수를 100점으로 회복하려면 정면 허용 범위를 1초 연속 확인합니다.
  recoveryMs: 1000,
  // 유예가 끝나면 초당 최대 35점씩 원점수 쪽으로 낮춥니다.
  penaltyPointsPerSecond: 35,
});

/**
 * 설정 내용에서 짧은 구분값(해시)을 만듭니다. 설정이 달라지면 값도 달라집니다.
 * 아래 반복문은 ID를 만드는 과정이며 점수 계산식은 아닙니다.
 */
export function settingsHash(value: unknown) {
  let hash = 2166136261;
  for (const char of JSON.stringify(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}

/**
 * 설정을 짧은 문자열 ID로 바꿉니다. 예: upper-body-shoulder-v3-<해시>.
 * 서로 다른 규칙으로 계산한 기록을 통계에서 섞지 않기 위해 저장합니다.
 */
export function scoreSettingsVersion(part: 'shoulder', weights: object, limits: object) {
  return `upper-body-${part}-v3-${settingsHash({ weights, limits, yaw: YAW_LIMIT, motion: MOTION_PROTECTION, verticalGain: SHOULDER_VERTICAL_GAIN })}`;
}
