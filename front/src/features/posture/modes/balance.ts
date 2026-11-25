import { settingsHash } from '../scoreSettings.ts';
import type { NeckFrame } from '../e19/model.ts';
import { NECK_MAX_YAW_DEG, NECK_ONE_EURO } from './turtle.ts';

/**
 * [역할: 좌우 균형 점수 정책 (2026-11-25, 어깨 점수를 대신함)]
 * 측정 시작 때 5초 보정한 자세보다 고개가 옆으로 기운 각도, 그리고 양쪽 어깨가 또렷이 보이면 어깨선이 기운 각도 중
 * 더 기운 쪽으로 점수를 매깁니다. 고개는 얼굴 분석의 머리 회전 행렬(좌우로 갸웃한 roll), 어깨선은 포즈의 양 어깨 점을 잇는
 * 선의 화면 각도입니다. 고개가 안 보이면 재지 않고(어깨만으로 매기지 않음), 어깨가 안 보이면 고개만으로 잽니다.
 * 3°·18°와 어깨 가시성 0.7은 실제 사용으로 다듬을 잠정 설정이며 진단 기준이 아닙니다.
 */
export const BALANCE = Object.freeze({ fullDeg: 3, zeroDeg: 18, minShoulderVisibility: 0.7 });
// 목과 같은 기준 이탈 환산: 편차 = (100 − 화면의 정수 점수) / 200. 기준은 알림 설정의 "N점 이하 N초"(evaluation.ts의 habitRule).
export const BALANCE_DEVIATION_SCALE = 200;

// 설정 화면의 "좌우 균형 민감도"(2026-11-25, 자세 무너짐 민감도 자리). 50%가 위의 3°/18°이고, 10%p 올릴 때마다 두 각도가
// 기본값의 10%씩 작아져 덜 기울어도 점수가 내려갑니다. 예: 100% → 1.5°/9°(70점이 되는 기울기 3.75°), 10% → 4.2°/25.2°(10.5°).
export const BALANCE_SENSITIVITY = Object.freeze({ min: 10, max: 100, step: 10, default: 50 });

/** 슬라이더 범위와 10% 간격에 맞춘 값입니다. 읽을 수 없는 값은 기본 50%로 봅니다. */
export function normalizeBalanceSensitivity(value: unknown) {
  const { min, max, step } = BALANCE_SENSITIVITY;
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number / step) * step)) : BALANCE_SENSITIVITY.default;
}

const BASE_VERSION = `upper-body-balance-v1-${settingsHash({ ...BALANCE, oneEuro: NECK_ONE_EURO, maxYawDeg: NECK_MAX_YAW_DEG, deviationScale: BALANCE_DEVIATION_SCALE })}`;
export interface BalancePolicy { version: string; mode: 'balance'; fullDeg: number; zeroDeg: number }

/**
 * 민감도별 좌우 균형 정책. 산식·필터·조건이 바뀌면 ID도 바뀌어 다른 기록과 섞이지 않습니다. 기본 50%는 ID 그대로이고,
 * 다른 값은 ID에 `:s<값>`을 붙여 통계가 같은 민감도로 잰 기록끼리만 묶습니다.
 */
export function balancePolicy(sensitivity: number = BALANCE_SENSITIVITY.default): BalancePolicy {
  const value = normalizeBalanceSensitivity(sensitivity);
  const factor = 1 + (BALANCE_SENSITIVITY.default - value) / 100;
  const scaled = (deg: number) => Math.round(deg * factor * 1e4) / 1e4;
  return Object.freeze({ version: value === BALANCE_SENSITIVITY.default ? BASE_VERSION : `${BASE_VERSION}:s${value}`,
    mode: 'balance', fullDeg: scaled(BALANCE.fullDeg), zeroDeg: scaled(BALANCE.zeroDeg) });
}
export const balanceScorePolicy = balancePolicy();

/** 앱이 지금 쓰는 민감도 중 하나로 잰 기록인지(학습이력의 "이전 기준" 판단). */
export function isCurrentBalancePolicy(version: string) {
  for (let value = BALANCE_SENSITIVITY.min; value <= BALANCE_SENSITIVITY.max; value += BALANCE_SENSITIVITY.step) {
    if (balancePolicy(value).version === version) return true;
  }
  return false;
}

export interface BalanceAngles { headRollDeg: number | null; shoulderDeg: number | null }
export type BalanceReference = BalanceAngles;

const DEG = 180 / Math.PI;
/** −180°…180° 사이의 각도 차이(359°와 1°의 차이는 2°). */
const angleDiff = (a: number, b: number) => ((a - b) % 360 + 540) % 360 - 180;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** 머리 회전 행렬(열 우선, R(r, c) = f[4c + r])의 좌우 기울기(roll)와 좌우 돌림(yaw, E19와 같은 식). */
export function headAngles(f: ArrayLike<number>) {
  return { rollDeg: Math.atan2(f[1], f[0]) * DEG, yawDeg: Math.atan2(-f[2], Math.hypot(f[6], f[10])) * DEG };
}

/**
 * 한 프레임의 고개·어깨선 각도. 고개는 정면에서 25°(목 점수와 같은 한도) 넘게 돌리면, 어깨선은 한쪽이라도 가시성이 낮으면 null.
 * 어깨선은 두 점의 왼쪽·오른쪽 순서와 상관없이 수평선과 이루는 기울기(−90°…90°)라, 거울 영상에서도 ±180° 근처로 튀지 않습니다
 * (부호만 바뀌고, 기준도 같은 영상에서 잽니다).
 */
export function balanceAngles(frame: NeckFrame): BalanceAngles {
  let headRollDeg: number | null = null;
  if (frame.fmat) {
    const { rollDeg, yawDeg } = headAngles(frame.fmat);
    if (Math.abs(yawDeg) <= NECK_MAX_YAW_DEG) headRollDeg = rollDeg;
  }
  let shoulderDeg: number | null = null;
  const p = frame.pose;
  if (p && (p[11]?.[3] ?? 0) >= BALANCE.minShoulderVisibility && (p[12]?.[3] ?? 0) >= BALANCE.minShoulderVisibility) {
    const dx = (p[11][0] - p[12][0]) * frame.imageW, dy = (p[11][1] - p[12][1]) * frame.imageH;
    if (Math.hypot(dx, dy) > 0) shoulderDeg = Math.atan2(dx < 0 ? -dy : dy, Math.abs(dx)) * DEG;
  }
  return { headRollDeg, shoulderDeg };
}

/** 보정 5초 프레임의 중앙값. 각각 프레임의 절반 이상(최소 3장)에서 잰 경우에만 기준으로 씁니다. */
export function balanceReference(frames: readonly NeckFrame[]): BalanceReference {
  const angles = frames.map(balanceAngles);
  const enough = (count: number) => count >= Math.max(3, frames.length / 2);
  const heads = angles.flatMap(a => a.headRollDeg === null ? [] : [a.headRollDeg]);
  const shoulders = angles.flatMap(a => a.shoulderDeg === null ? [] : [a.shoulderDeg]);
  return { headRollDeg: enough(heads.length) ? median(heads) : null, shoulderDeg: enough(shoulders.length) ? median(shoulders) : null };
}

/** 기준보다 더 기운 쪽의 각도(°). 고개를 잴 수 없으면 null입니다. */
export function balanceTiltDeg(angles: BalanceAngles, reference: BalanceReference): number | null {
  if (angles.headRollDeg === null || reference.headRollDeg === null) return null;
  const head = Math.abs(angleDiff(angles.headRollDeg, reference.headRollDeg));
  const shoulder = angles.shoulderDeg !== null && reference.shoulderDeg !== null ? Math.abs(angles.shoulderDeg - reference.shoulderDeg) : 0;
  return Math.max(head, shoulder);
}

/** 좌우 균형 점수(0–100): 기본 민감도에서 기운 각도 3° 이내 100점, 18° 이상 0점, 사이는 직선(1°에 약 6.7점). */
export function balanceScore(tiltDeg: number, policy: Pick<BalancePolicy, 'fullDeg' | 'zeroDeg'> = balanceScorePolicy) {
  if (tiltDeg <= policy.fullDeg) return 100;
  if (tiltDeg >= policy.zeroDeg) return 0;
  return 100 * (policy.zeroDeg - tiltDeg) / (policy.zeroDeg - policy.fullDeg);
}
/** 습관 집계(기준 이탈)에 쓰는 편차. 알림과 같게 화면에 보이는 정수 점수로 셉니다. */
export const balanceDeviation = (score: number) => (100 - Math.round(score)) / BALANCE_DEVIATION_SCALE;
