import { settingsHash } from '../scoreSettings.ts';
import { NECK_FLOW } from '../e19/flow.ts';
import type { NeckModelConfig } from '../e19/model.ts';
import cvaMap from '../e19/cva_map.json' with { type: 'json' };

/**
 * [역할: 목 점수 정책 — 거북목 모델 E19(20261117_ensemble_v1)]
 * 목 점수 = 100 − E19 목 부하 점수(One Euro 필터 후). 100 = 측정 시작 때 5초 보정한 자세와 같음.
 * 화면의 추정 CVA는 같은 목 부하를 각도로 바꾼 값이며(2026-11-24부터 부하 기준) 저장하지 않습니다.
 * 진단·임상 CVA가 아니라 보정 자세와 비교한 참고값입니다.
 */
// 목의 '기준 이탈' 편차 = (100 − 화면의 정수 목 점수) / 200. 알림 기본값(70점 이하 3초)이면 진입 0.15·종료 0.10(80점 이상).
export const NECK_DEVIATION_SCALE = 200;
// 연구 도구와 같은 One Euro 설정(min_cutoff·beta는 패키지 config.json temporal.one_euro, dCutoff는 도구의 기본값).
export const NECK_ONE_EURO = Object.freeze({ minCutoff: 0.5, beta: 0.01, dCutoff: 1.0 });
// 화면 CVA = 기준 CVA − 목 부하를 환산한 CVA 감소량. 기준 CVA는 설정에서 고르는 표시값입니다.
export const BASE_CVA = Object.freeze({ min: 40, max: 60, default: 50 });
// 고개 좌우 한도: 연구 패키지는 35°(거의 옆을 봐야 멈춤)지만, 살짝 옆을 봐도 멈추도록 앱은 25°로 낮춥니다
// (사용자 결정 2026-11-23). 모델 출력 뒤에 머리 행렬로 거르는 검사라 재학습은 필요 없습니다.
export const NECK_MAX_YAW_DEG = 25;
const E19_MODEL_SHA256 = '5ab5d8865e5ffc93f492bc158a2bf3cd4c9546169a3b1e7d6a10b06a3883b2c0';

/** 앱이 쓰는 E19 설정: 패키지 config.json 그대로에 고개 좌우 한도만 바꿉니다. */
export const appNeckConfig = <T extends NeckModelConfig>(config: T): T => ({ ...config, qc: { ...config.qc, max_abs_yaw_deg: NECK_MAX_YAW_DEG } });

/** 점수 산식·모델·필터·이탈 환산·보정 순서·측정 조건이 바뀌면 ID도 바뀌어 다른 기록과 섞이지 않습니다. */
export const turtleScorePolicy = Object.freeze({
  version: `upper-body-neck-e19-v1-${settingsHash({ model: E19_MODEL_SHA256, score: 'load', loadRefPct: 150, oneEuro: NECK_ONE_EURO, deviationScale: NECK_DEVIATION_SCALE, flow: NECK_FLOW, collectSec: 5, gate: 'e19-qc', maxYawDeg: NECK_MAX_YAW_DEG })}`,
  mode: 'turtle' as const,
});

/** 목 점수(0–100): E19 목 부하 점수를 100에서 뺍니다. */
export const neckScore = (loadScore: number) => 100 - loadScore;
/** 습관 집계(기준 이탈)에 쓰는 편차. 알림과 같게 화면에 보이는 정수 점수로 셉니다. */
export const neckDeviation = (score: number) => (100 - Math.round(score)) / NECK_DEVIATION_SCALE;
/** 목 부하 L′(%, 0–150) = One Euro 후 목 부하 점수 × 1.5 = (100 − 목 점수) × 1.5. 0보다 작으면 0. */
export const neckLoadPct = (score: number) => Math.max(0, (100 - score) * 1.5);
/**
 * 추정 CVA(부하 기준) = 기준 CVA − 환산(L′). 환산은 인계 패키지 runtime/cva_map.json(숫자 변경 금지)의
 * 목 부하 → CVA 감소 표를 선형 보간하며 표 양 끝 밖은 끝값입니다. 잰 각도가 아니라 지금 목 부하가
 * 보통 CVA 몇 도일 때의 부하와 비슷한지 보여 주는 참고값입니다.
 */
export const estimatedCva = (baseCva: number, loadPct: number) => {
  const { knots_load_pct: xs, dcva_deg: ys } = cvaMap;
  if (loadPct <= xs[0]) return baseCva - ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (loadPct <= xs[i]) return baseCva - (ys[i - 1] + (loadPct - xs[i - 1]) / (xs[i] - xs[i - 1]) * (ys[i] - ys[i - 1]));
  }
  return baseCva - ys[ys.length - 1];
};
