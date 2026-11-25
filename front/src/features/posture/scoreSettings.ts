/**
 * [역할: 점수 규칙의 공통 숫자 설정]
 * 실험용 제품 설정이며 의료 기준은 아닙니다. 수정 후 새 측정을 시작하세요.
 * 2026-11-25에 어깨 점수(가중치·감점 범위·움직임 보호)를 없애고 좌우 균형(modes/balance.ts)으로 바꿨습니다.
 */
// 코가 양 귀의 중점에서 얼마나 옆으로 벗어났는지 / 귀 폭. 0.15는 회전 각도가 아닙니다.
// 이 비율을 넘으면 포즈 관찰(observation.ts)이 고개를 돌린 상태로 보고 관찰 불가 이유를 남깁니다.
export const YAW_LIMIT = 0.15;

/**
 * 설정 내용에서 짧은 구분값(해시)을 만듭니다. 설정이 달라지면 값도 달라집니다.
 * 점수 정책 ID(예: upper-body-balance-v1-<해시>)에 붙여 서로 다른 규칙의 기록을 통계에서 섞지 않습니다.
 */
export function settingsHash(value: unknown) {
  let hash = 2166136261;
  for (const char of JSON.stringify(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}
