/**
 * [역할: 점수 규칙의 숫자 설정]
 * observation.ts가 측정값을 만들고, scoring.ts와 evaluation.ts가 여기의 숫자를 사용합니다.
 * 감도·100점 범위·감점 속도·대기 시간을 조절할 때 먼저 보는 파일입니다.
 * 실험용 제품 설정이며 의료 기준은 아닙니다. 수정 후 새 측정을 시작하세요.
 */
// 가중치 = 각 변화가 점수에 얼마나 영향을 주는지 정하는 비중입니다.
// main의 목 비중 35/25/40을 유지하되 입력을 상대 움직임과 조건부 모델 보조로 교체합니다.
// 화면 전체의 확대를 목 전진으로 세지 않습니다. 기본 관측에는 골반이 필요하지 않습니다.
// 어깨: 양어깨 기울기 70%, 귀-어깨 간격의 상하 변화 30%.
// 각 부위의 기본 가중치 합은 1입니다. 합을 자동으로 맞춰 주지는 않습니다.
export const NECK_WEIGHTS = Object.freeze({ headForward: 0.35, torsoForward: 0.25, neckSlump: 0.4 });
export const SHOULDER_WEIGHTS = Object.freeze({ shoulderTilt: 0.7, shoulderShrug: 0.3 });
// 여러 변화를 가중합한 편차가 fullCreditDelta 이하면 100점, zeroCreditDelta 이상이면 0점.
// 두 경계 사이는 scoring.ts에서 직선 비례로 환산합니다. 0.04는 4도나 4cm가 아닙니다.
export const NECK_LIMITS = Object.freeze({ fullCreditDelta: 0.04, zeroCreditDelta: 0.20 });
export const SHOULDER_LIMITS = Object.freeze({ fullCreditDelta: 0.04, zeroCreditDelta: 0.22 });
// 머리 움직임도 섞이는 귀-어깨 간격의 감도를 낮춥니다. 기울기 항에는 곱하지 않습니다.
export const SHOULDER_VERTICAL_GAIN = 0.8;
// 기준 대비 화면상 양어깨 선의 각도. 작은 변화는 기존 선형 감도를 유지합니다.
export const SHOULDER_CURVE = Object.freeze({ kneeDegrees: 4, doublingDegrees: 3, extraDeviation: 0.08 });
// 머리 전진 + 기하 편차가 함께 있을 때 누적합니다. 기본 80점 부근도 포함합니다.
// 학습 모델 항은 진입 판단에서 제외하며 아주 작은 변화는 여전히 누적하지 않습니다.
// 값/예시/복귀 계약: docs/posture-score-tuning.md
export const NECK_SUSTAINED = Object.freeze({
  minHeadForward: 0.16, minGeometryDeviation: 0.065,
  recoveryHeadForward: 0.12, recoveryGeometryDeviation: 0.045,
  delayMs: 5000, pointsPerSecond: 2, recoveryMs: 1000,
});
// 코가 양 귀의 중점에서 얼마나 옆으로 벗어났는지 / 귀 폭. 0.15는 회전 각도가 아닙니다.
// 이 비율을 넘으면 귀 좌표 비교를 믿기 어려워 목·어깨 모두 판정을 보류합니다.
export const YAW_LIMIT = 0.15;
// MediaPipe의 추정 3D 양어깨 깊이 차이 / 3D 어깨 폭. 실제 회전 각도는 아닙니다.
export const BODY_YAW_LIMIT = 0.55;
export const OBSERVATION_FILTER = Object.freeze({ samples: 3, windowMs: 250 });
// Provisional camera-projection tolerances, NOT anatomical distances or learned constants.
export const RELATIVE_HEAD = Object.freeze({
  scaleToleranceGain: 0.3, maxScaleTolerance: 0.08,
  depthScaleFade: 0.08, depthNoise: 0.02, headGain: 2,
  modelMaxDelta: 0.08, modelEvidenceDelta: 0.2,
});
// Object.freeze는 실행 중 설정 객체가 다른 코드에 의해 바뀌지 않도록 막습니다.
export const MOTION_PROTECTION = Object.freeze({
  // 해상도와 화면상 몸 크기에 독립적인 속도입니다(어깨 폭/초).
  velocityShoulderWidthsPerSecond: 0.5,
  // 멈춘 뒤 기준에서 벗어난 상태가 이어져도 처음 2초는 감점을 기다립니다.
  graceMs: 2000,
  // 낮아진 점수를 100점으로 회복하려면 정면 허용 범위를 1초 연속 확인합니다.
  recoveryMs: 1000,
  // 유예가 끝나면 초당 최대 35점씩 원점수 쪽으로 낮춥니다.
  penaltyPointsPerSecond: 35,
});

/**
 * 설정을 짧은 문자열 ID로 바꿉니다. 예: upper-body-shoulder-v6-<해시>.
 * 해시 = 설정 내용에서 계산한 구분값입니다. 설정이 달라지면 ID도 달라집니다.
 * 서로 다른 규칙으로 계산한 기록을 통계에서 섞지 않기 위해 저장합니다.
 * 아래 반복문은 ID를 만드는 과정이며 점수 계산식은 아닙니다.
 */
export function scoreSettingsVersion(part: 'neck' | 'shoulder', weights: object, limits: object) {
  const text = JSON.stringify({ weights, limits, yaw: YAW_LIMIT, bodyYaw: BODY_YAW_LIMIT, motion: MOTION_PROTECTION, filter: OBSERVATION_FILTER,
    relativeHead: RELATIVE_HEAD, auxiliaryModel: 'multiposture-trunk-mlp-v1',
    verticalGain: part === 'shoulder' ? SHOULDER_VERTICAL_GAIN : 1,
    shoulderCurve: part === 'shoulder' ? SHOULDER_CURVE : null,
    sustained: part === 'neck' ? NECK_SUSTAINED : null });
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `upper-body-${part}-v6-${(hash >>> 0).toString(36)}`;
}
