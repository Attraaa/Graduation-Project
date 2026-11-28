import { MAX_REVIEW_DAYS, type DailyPostureScore, type DailyReviewInput, type ReviewRequest, type ScorePeriod } from '../../../database/localReview.ts';
import { buildReviewPlan, renderRecord, type SectionKey } from './reviewFacts.js';
import { buildRangeReviewPlan, renderRangeRecord } from './rangeReviewFacts.js';
import { pickAdvice, reviewAdvice } from './reviewAdvice.js';
import { KEYBOARD_CODES } from '../../../database/keyboard.ts';
import { HttpError } from '../http.js';
import { bodyObject, dateParam, decimal, integer, list, optional } from '../validation.js';

export type ReviewInput = ReviewRequest;

export interface ReviewSection { key: SectionKey; title: string; text: string }
export interface Review {
  headline: string;
  sections: ReviewSection[];
  strengths: string[];
  weaknesses: string[];
  goals: string[];
  caution: string | null;
  model: string;
  /** Whether the habit ending the overall paragraph came from the model or, when it gave none, from the records. */
  adviceSource?: 'model' | 'record';
}
export type Reviewer = (input: ReviewInput) => Promise<Review>;

const MAX_DAY_MINUTES = 1500;
const ROUNDING_TOLERANCE = 0.011;
const METRICS = ['neck', 'balance', 'shoulder'] as const;
const percent = (value: unknown, name: string) => optional(value, item => decimal(item, name, 0, 100));
const minutes = (value: unknown, name: string, max = MAX_DAY_MINUTES) => decimal(value, name, 0, max);
const section = <T>(value: unknown, read: (input: Record<string, unknown>) => T) => optional(value, item => read(bodyObject(item)));

function scorePeriod(value: Record<string, unknown>, windowMinutes: number): ScorePeriod {
  if (windowMinutes <= 0) throw new HttpError(400, '점수를 관찰한 구간 길이가 올바르지 않습니다.');
  const validMinutes = minutes(value.validMinutes, '구간 유효 관찰 시간', windowMinutes + ROUNDING_TOLERANCE);
  if (validMinutes === 0) throw new HttpError(400, '구간에 유효한 관찰 시간이 필요합니다.');
  return { mean: decimal(value.mean, '구간 평균 점수', 0, 100), validMinutes };
}

function postureScore(value: unknown, measuredMinutes: number): DailyPostureScore {
  const item = bodyObject(value);
  const metric = METRICS.find(candidate => candidate === item.metric);
  if (!metric) throw new HttpError(400, '상체 점수 항목이 올바르지 않습니다.');
  const policyVersion = item.policyVersion;
  if (policyVersion !== undefined && (typeof policyVersion !== 'string' || !/^[a-z0-9._:-]{1,120}$/i.test(policyVersion))) {
    throw new HttpError(400, '상체 점수 기준이 올바르지 않습니다.');
  }
  const total = scorePeriod(item, measuredMinutes);
  const lastWindowMinutes = Math.min(10, measuredMinutes);
  const beforeLastTen = section(item.beforeLastTen, part => scorePeriod(part, measuredMinutes - lastWindowMinutes));
  const lastTen = section(item.lastTen, part => scorePeriod(part, lastWindowMinutes));
  if (!Array.isArray(item.periods) || item.periods.length > 300) {
    throw new HttpError(400, '누적 측정 구간은 300개 이하의 목록이어야 합니다.');
  }
  let previousEnd = 0;
  const periods = item.periods.map(raw => {
    const period = bodyObject(raw);
    const startMinute = minutes(period.startMinute, '구간 시작', measuredMinutes + ROUNDING_TOLERANCE);
    const endMinute = minutes(period.endMinute, '구간 끝', measuredMinutes + ROUNDING_TOLERANCE);
    const length = endMinute - startMinute;
    if (startMinute < previousEnd || length <= 0 || length > 5 + ROUNDING_TOLERANCE) {
      throw new HttpError(400, '누적 측정 구간은 겹치지 않는 5분 이내의 구간이어야 합니다.');
    }
    previousEnd = endMinute;
    return { startMinute, endMinute, ...scorePeriod(period, length) };
  });
  return { metric, ...(policyVersion === undefined ? {} : { policyVersion }), ...total, beforeLastTen, lastTen, periods };
}

function frequentKeys(value: unknown) {
  if (!Array.isArray(value) || value.length > 3) throw new HttpError(400, '자주 다른 키는 0~3개여야 합니다.');
  return value.map(item => {
    const key = bodyObject(item);
    if (typeof key.code !== 'string' || !KEYBOARD_CODES.has(key.code)) throw new HttpError(400, '알 수 없는 키 코드입니다.');
    return { code: key.code, differentRate: decimal(key.differentRate, '다른 손가락 비율', 0, 100) };
  });
}

// Only a calendar date, bounded numbers and known key codes reach the reviewer.
function parseDay(input: Record<string, unknown>, allowEmpty = false): DailyReviewInput {
  const date = dateParam(input.date);
  if (!date) throw new HttpError(400, '총평을 받을 날짜를 선택해 주세요.');
  const posture = section(input.posture, item => {
    const measuredMinutes = minutes(item.measuredMinutes, '상체 측정 시간');
    const scores = list(item.scores, '상체 점수', METRICS.length).map(score => postureScore(score, measuredMinutes));
    if (!scores.length || new Set(scores.map(score => score.metric)).size !== scores.length) throw new HttpError(400, '상체 점수 항목을 확인해 주세요.');
    return { measuredMinutes, scores, sessions: integer(item.sessions, '측정 횟수', 1, 100_000) };
  });
  const eye = section(input.eye, item => ({
    blinkRate: optional(item.blinkRate, value => decimal(value, '깜빡임 빈도', 0, 300)),
    validMinutes: minutes(item.validMinutes, '유효 관찰 시간'),
  }));
  const keyboard = section(input.keyboard, item => ({
    score: percent(item.score, '훈련 점수'), coverage: percent(item.coverage, '판정 가능 비율'),
    consistency: percent(item.consistency, '사용 일관성'), judged: integer(item.judged, '판정한 입력 수', 0, 1_000_000_000),
    frequentKeys: frequentKeys(item.frequentKeys),
  }));
  if (!allowEmpty && !posture && !eye && !keyboard) throw new HttpError(400, '기록이 있는 날짜만 총평을 만들 수 있습니다.');
  return { date, posture, eye, keyboard };
}

export function parseReviewInput(body: unknown): ReviewInput {
  const input = bodyObject(body);
  if (!('days' in input) && !('from' in input) && !('to' in input)) return parseDay(input);
  const from = dateParam(input.from), to = dateParam(input.to);
  const ms = (day: string) => Date.parse(`${day}T00:00:00Z`);
  if (!from || !to || to < from || ms(to) - ms(from) >= MAX_REVIEW_DAYS * 86_400_000) {
    throw new HttpError(400, '총평 기간은 연속된 날짜로 최대 7일까지 선택할 수 있어요.');
  }
  const days = list(input.days, '날짜별 기록', MAX_REVIEW_DAYS).map(value => parseDay(bodyObject(value), true));
  if (days.some((day, index) => day.date < from || day.date > to || (index > 0 && day.date <= days[index - 1].date))) {
    throw new HttpError(400, '날짜별 기록은 선택한 기간 안에서 날짜순으로 보내 주세요.');
  }
  const measured = days.filter(day => day.posture || day.eye || day.keyboard);
  if (!measured.length) throw new HttpError(400, '선택한 기간에 측정한 기록이 없어요.');
  return { from, to, days: measured };
}

/**
 * Bridges the authenticated app API to the mini PC's fixed, private /review endpoint. Every number, judgement and
 * paragraph comes from buildReviewPlan; the model only proposes the habit that ends the overall paragraph.
 */
export function createMiniPcReviewer(url: string, send: typeof fetch = fetch): Reviewer {
  return async input => {
    const plan = 'days' in input ? buildRangeReviewPlan(input) : buildReviewPlan(input);
    const options = reviewAdvice(plan.focus);
    const facts = 'days' in input ? renderRangeRecord(plan, input) : renderRecord(plan, input);
    const record = [facts, `[조언의 근거] ${plan.evidence}`, '[선택할 수 있는 습관]', ...options,
      '선택한 날짜들의 기록과 조언의 근거를 읽어 주세요. 마지막 문장에 위 습관 중 가장 적절한 문장 하나를 그대로 써 주세요.'].join('\n');
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
    const advice = pickAdvice(reply.summary, options);
    const [overall, ...areas] = plan.sections;
    const explanation = overall.text.includes(plan.evidence) ? '' : plan.evidence;
    return {
      headline: plan.headline, sections: [{ ...overall, text: [overall.text, explanation, advice.text].filter(Boolean).join(' ') }, ...areas],
      strengths: plan.strengths, weaknesses: plan.weaknesses, goals: plan.goals, caution: plan.caution,
      model: reply.model, adviceSource: advice.source,
    };
  };
}
