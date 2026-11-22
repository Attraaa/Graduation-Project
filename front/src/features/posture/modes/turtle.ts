import { settingsHash } from '../scoreSettings.ts';
import { NECK_FLOW } from '../e19/flow.ts';

/**
 * [역할: 목 점수 정책 — 거북목 모델 E19(20261117_ensemble_v1)]
 * 목 점수 = 100 − E19 목 부하 점수(One Euro 필터 후). 100 = 측정 시작 때 5초 보정한 자세와 같음.
 * 화면의 추정 CVA는 목 전진 출력(줄어든 목 각도)으로 따로 계산하며 저장하지 않습니다.
 * 진단·임상 CVA가 아니라 보정 자세와 비교한 참고값입니다.
 */
// 목의 '기준 이탈' 편차 = (100 − 목 점수) / 200. 기본 민감도(진입 0.15·복귀 0.10)에서 70점 이하 2초 → 이탈, 80점 이상 → 복귀.
export const NECK_DEVIATION_SCALE = 200;
// 연구 도구와 같은 One Euro 설정(min_cutoff·beta는 패키지 config.json temporal.one_euro, dCutoff는 도구의 기본값).
export const NECK_ONE_EURO = Object.freeze({ minCutoff: 0.5, beta: 0.01, dCutoff: 1.0 });
// 화면 CVA = 기준 CVA − 줄어든 목 각도. 기준 CVA는 설정에서 고르는 표시값입니다.
export const BASE_CVA = Object.freeze({ min: 40, max: 60, default: 50 });
const E19_MODEL_SHA256 = '5ab5d8865e5ffc93f492bc158a2bf3cd4c9546169a3b1e7d6a10b06a3883b2c0';

/** 점수 산식·모델·필터·이탈 환산·보정 순서가 바뀌면 ID도 바뀌어 다른 기록과 섞이지 않습니다. */
export const turtleScorePolicy = Object.freeze({
  version: `upper-body-neck-e19-v1-${settingsHash({ model: E19_MODEL_SHA256, score: 'load', loadRefPct: 150, oneEuro: NECK_ONE_EURO, deviationScale: NECK_DEVIATION_SCALE, flow: NECK_FLOW, collectSec: 5 })}`,
  mode: 'turtle' as const,
});

/** 목 점수(0–100): E19 목 부하 점수를 100에서 뺍니다. */
export const neckScore = (loadScore: number) => 100 - loadScore;
/** 습관 집계(기준 이탈)에 쓰는 편차. */
export const neckDeviation = (score: number) => (100 - score) / NECK_DEVIATION_SCALE;
/** 추정 CVA(목 기준) = 기준 CVA − 보정 자세보다 줄어든 목 각도(0–40°). */
export const estimatedCva = (baseCva: number, angleDropDeg: number) => baseCva - angleDropDeg;
