import type { LocalPostureReview } from '../../../database/localReview.ts';
import { buildReviewFacts, cautionNote, renderSummaryInput, SHOWN_CANDIDATES } from './reviewFacts.js';
import { pickAdvice, reviewAdvice } from './reviewAdvice.js';
import { KEYBOARD_CODES } from '../../../database/keyboard.ts';
import { HttpError } from '../http.js';
import { bodyObject, decimal, integer, optional } from '../validation.js';

type Pair = { current: number | null; previous: number | null };
/**
 * 통계 화면과 같은 기간 집계입니다. 숫자와 알려진 키 코드만 받으므로 요청에 자유 문장이 실리지 않습니다.
 * 영상·키 입력 원문·계정 정보는 받지도 보내지도 않습니다.
 */
export interface ReviewInput {
  days: 7 | 30;
  localPosture?: LocalPostureReview;
  upper: {
    neck: Pair; balance: Pair; measuredMinutes: number; sessions: number;
    deviations: number; deviationRate: number | null; validRate: number | null;
  } | null;
  eye: { blinkRate: number | null; previousBlinkRate: number | null; validMinutes: number } | null;
  keyboard: {
    score: number | null; previousScore: number | null; coverage: number | null; consistency: number | null;
    judged: number; frequentKeys: { code: string; differentRate: number }[];
  } | null;
}
export interface Review { summary: string; strengths: string[]; improvements: string[]; model: string; adviceSource?: 'model' | 'record' }
export type Reviewer = (input: ReviewInput) => Promise<Review>;

const MAX_MINUTES = 60 * 24 * 31;
const percent = (value: unknown, name: string) => optional(value, item => decimal(item, name, 0, 100));
const minutes = (value: unknown, name: string) => decimal(value, name, 0, MAX_MINUTES);
const pair = (value: unknown, name: string): Pair => {
  const input = bodyObject(value);
  return { current: percent(input.current, name), previous: percent(input.previous, `직전 ${name}`) };
};
const section = <T>(value: unknown, read: (input: Record<string, unknown>) => T) => optional(value, item => read(bodyObject(item)));

function frequentKeys(value: unknown) {
  if (!Array.isArray(value) || value.length > 3) throw new HttpError(400, '자주 다른 키는 0~3개여야 합니다.');
  return value.map(item => {
    const key = bodyObject(item);
    if (typeof key.code !== 'string' || !KEYBOARD_CODES.has(key.code)) throw new HttpError(400, '알 수 없는 키 코드입니다.');
    return { code: key.code, differentRate: decimal(key.differentRate, '다른 손가락 비율', 0, 100) };
  });
}

export function parseReviewInput(body: unknown): ReviewInput {
  const input = bodyObject(body);
  const days = input.days === 7 || input.days === 30 ? input.days : null;
  if (!days) throw new HttpError(400, '기간은 7일 또는 30일이어야 합니다.');
  const upper = section(input.upper, item => ({
    neck: pair(item.neck, '목 점수'), balance: pair(item.balance, '좌우 균형 점수'),
    measuredMinutes: minutes(item.measuredMinutes, '측정 시간'),
    sessions: integer(item.sessions, '측정 횟수', 0, 100_000),
    deviations: integer(item.deviations, '기준 이탈 횟수', 0, 10_000_000),
    deviationRate: percent(item.deviationRate, '기준 이탈 시간 비율'),
    validRate: percent(item.validRate, '측정 품질'),
  }));
  const eye = section(input.eye, item => ({
    blinkRate: optional(item.blinkRate, value => decimal(value, '깜빡임 빈도', 0, 300)),
    previousBlinkRate: optional(item.previousBlinkRate, value => decimal(value, '직전 깜빡임 빈도', 0, 300)),
    validMinutes: minutes(item.validMinutes, '유효 관찰 시간'),
  }));
  const keyboard = section(input.keyboard, item => ({
    score: percent(item.score, '훈련 점수'), previousScore: percent(item.previousScore, '직전 훈련 점수'),
    coverage: percent(item.coverage, '판정 가능 비율'), consistency: percent(item.consistency, '사용 일관성'),
    judged: integer(item.judged, '판정한 입력 수', 0, 1_000_000_000),
    frequentKeys: frequentKeys(item.frequentKeys),
  }));
  const localPosture = section(input.localPosture, (item): LocalPostureReview => {
    if (item.sideMetric !== 'balance' && item.sideMetric !== 'shoulder') throw new HttpError(400, '상체 점수 항목이 올바르지 않습니다.');
    const neck = pair(item.neck, '목 점수'), side = pair(item.side, '어깨 또는 좌우 균형 점수');
    if (neck.current === null && side.current === null) throw new HttpError(400, '측정한 상체 점수가 없습니다.');
    const latestNeckBand = section(item.latestNeckBand, band => {
      const fromPoints = decimal(band.fromPoints, '구간 시작', 0, 100), toPoints = decimal(band.toPoints, '구간 끝', 0, 100);
      if (fromPoints >= toPoints) throw new HttpError(400, '점수 구간이 올바르지 않습니다.');
      return { fromPoints, toPoints, percentOfValidTime: decimal(band.percentOfValidTime, '유효 시간 비율', 0, 100) };
    });
    return { sideMetric: item.sideMetric, neck, side, latestNeckBand,
      measuredMinutes: minutes(item.measuredMinutes, '측정 시간'), sessions: integer(item.sessions, '측정 횟수', 1, 100_000) };
  });
  if (upper && localPosture) throw new HttpError(400, '상체 집계가 중복되었습니다.');
  if (!localPosture && !upper && !eye && !keyboard) throw new HttpError(400, '기록이 있는 기간만 총평을 만들 수 있습니다.');
  return { days, upper, eye, keyboard, ...(localPosture ? { localPosture } : {}) };
}

/** Bridges the authenticated app API to the mini PC's fixed, private /review endpoint. */
export function createMiniPcReviewer(url: string, send: typeof fetch = fetch): Reviewer {
  return async input => {
    const facts = buildReviewFacts(input);
    const options = reviewAdvice(input);
    const record = [renderSummaryInput(facts), '[다음 측정에서 연습할 수 있는 습관]', ...options.map(item => item.text),
      '화면에 수치와 변화는 이미 표시됩니다. 마지막 문장에는 위 습관 중 기록에 맞는 한 가지를 골라 숫자 없이 사용자에게 직접 권해 주세요.'].join('\n');
    const timeout = AbortSignal.timeout(95_000);
    const offline = () => new HttpError(503, '미니 PC 총평 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
    const timedOut = () => new HttpError(504, '총평 작성 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.');
    const invalid = () => new HttpError(502, '미니 PC가 총평을 완성하지 못했어요. 다시 시도해 주세요.');
    let reply;
    try {
      const response = await send(url, { method: 'POST', redirect: 'error', signal: timeout,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ record }) });
      if (response.status === 504) throw timedOut();
      if (response.status === 429 || response.status === 503) throw new HttpError(503, '미니 PC에서 다른 총평을 작성 중이에요. 잠시 후 다시 시도해 주세요.');
      if (!response.ok) throw invalid();
      reply = await response.json();
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (timeout.aborted) throw timedOut();
      if (error instanceof SyntaxError) throw invalid();
      throw offline();
    }
    if (typeof reply?.summary !== 'string' || !reply.summary.trim() || reply.summary.length > 4000
      || typeof reply.model !== 'string' || !reply.model.trim() || reply.model.length > 120) throw invalid();
    const note = cautionNote(facts);
    const advice = pickAdvice(reply.summary, options);
    return { summary: [facts.overview, advice.text, note].filter(Boolean).join(' '), model: reply.model, adviceSource: advice.source,
      strengths: facts.strengths.slice(0, SHOWN_CANDIDATES), improvements: facts.improvements.slice(0, SHOWN_CANDIDATES) };
  };
}
