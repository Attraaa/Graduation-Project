import Anthropic from '@anthropic-ai/sdk';
import { KEYBOARD_CODES } from '../../../database/keyboard.ts';
import { HttpError } from '../http.js';
import { bodyObject, decimal, integer, optional } from '../validation.js';

/** AI 총평에 쓰는 Claude 모델입니다. 바꾸면 비용과 문장이 달라지고 입력 계약은 그대로입니다. */
export const AI_REVIEW_MODEL = 'claude-opus-5-5';

type Pair = { current: number | null; previous: number | null };
/**
 * 통계 화면과 같은 기간 집계입니다. 숫자와 알려진 키 코드만 받으므로 요청에 자유 문장이 실리지 않습니다.
 * 영상·키 입력 원문·계정 정보는 받지도 보내지도 않습니다.
 */
export interface ReviewInput {
  days: 7 | 30;
  upper: {
    neck: Pair; shoulder: Pair; measuredMinutes: number; sessions: number;
    deviations: number; deviationRate: number | null; validRate: number | null;
  } | null;
  eye: { blinkRate: number | null; previousBlinkRate: number | null; validMinutes: number } | null;
  keyboard: {
    score: number | null; previousScore: number | null; coverage: number | null; consistency: number | null;
    judged: number; frequentKeys: { code: string; differentRate: number }[];
  } | null;
}
export interface Review { summary: string; strengths: string[]; improvements: string[]; model: string }
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
    neck: pair(item.neck, '목 점수'), shoulder: pair(item.shoulder, '어깨 점수'),
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
  if (!upper && !eye && !keyboard) throw new HttpError(400, '기록이 있는 기간만 총평을 만들 수 있습니다.');
  return { days, upper, eye, keyboard };
}

const SYSTEM_PROMPT = `당신은 자세·타자 습관 기록 앱 Moti의 코치입니다. 사용자의 최근 기간 기록을 읽고 앱의 "AI 총평" 화면에 들어갈 짧은 총평을 씁니다.

사용자 메시지의 JSON은 앱이 계산한 기간 집계입니다. 계산은 프로그램이 끝냈고, 당신은 그 수치를 해석해 설명합니다.
- days: 기간 길이(7 또는 30일). previous가 붙은 값은 바로 앞 같은 길이 기간의 값입니다.
- upper: 상체 측정. neck·shoulder는 0~100점 평균 점수로, 측정을 시작할 때 사용자가 잡은 자기 기준 자세와 얼마나 비슷했는지 나타냅니다. 실제 목 각도나 몸 상태가 아닙니다. measuredMinutes는 측정 시간(분), sessions는 측정 횟수, deviations는 기준 자세에서 2초 이상 벗어난 횟수, deviationRate는 제대로 관찰한 시간 중 기준에서 벗어나 있던 시간 비율(%), validRate는 측정 시간 중 얼굴과 어깨가 보여 실제로 분석한 시간 비율(%)입니다.
- eye: 깜빡임 관찰. blinkRate는 제대로 관찰한 시간 기준 분당 깜빡임 횟수, validMinutes는 제대로 관찰한 시간(분)입니다. 깜빡임 횟수는 점수가 아니며 건강 상태를 판단하는 근거가 아닙니다.
- keyboard: 타자 손가락 연습. score는 권장 손가락으로 누른 정도를 0~100으로 나타낸 훈련 점수, coverage는 손가락을 판정할 수 있었던 입력 비율(%), consistency는 같은 키를 같은 손가락으로 누른 비율(%), judged는 판정한 입력 수, frequentKeys는 권장과 다른 손가락을 자주 쓴 키(KeyboardEvent.code)와 그 키에서 다른 손가락을 쓴 비율(%)입니다.
- 값이 null이거나 영역 전체가 null이면 그 기간에 측정하지 않았거나 표본이 부족한 것입니다.

작성 규칙:
- 주어진 수치에 근거한 내용만 씁니다. 없는 수치나 원인을 지어내지 않습니다. 측정 시간이 짧거나 판정한 입력이 적으면 조심스럽게 해석합니다.
- 질환·증후군·위험도 같은 의학적 판단이나 진단을 하지 않습니다.
- 직전 기간과 비교할 수 있으면 변화 방향을 짚어 줍니다.
- 개선할 점은 다음 기간에 이 앱으로 바로 해 볼 수 있는 구체적인 행동으로 씁니다. 예: 측정을 더 자주 켜기, 기준 자세를 다시 잡기, 자주 다른 손가락을 쓴 키를 천천히 연습하기.
- 키 이름은 KeyA 대신 'A 키'처럼 사람이 읽는 이름으로 씁니다.
- 다정하고 담백한 해요체 한국어로 씁니다.

summary에는 기간 전체를 2~3문장으로 정리합니다. strengths와 improvements에는 각각 1~3개의 짧은 문장을 담습니다. 측정한 영역이 하나뿐이면 그 영역만 다룹니다.`;

// Structured output keeps the cards renderable; item counts are enforced after parsing.
const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    improvements: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'strengths', 'improvements'],
  additionalProperties: false,
};

const unreadable = () => new HttpError(502, 'AI 응답을 읽지 못했어요. 다시 시도해 주세요.');

function parseReview(text: string | undefined) {
  let value: unknown;
  try { value = JSON.parse(text ?? ''); } catch { throw unreadable(); }
  const review = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const lines = (items: unknown) => (Array.isArray(items) ? items : [])
    .filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, 3);
  const summary = typeof review.summary === 'string' ? review.summary.trim() : '';
  if (!summary) throw unreadable();
  return { summary, strengths: lines(review.strengths), improvements: lines(review.improvements) };
}

/** SDK 오류를 화면에 보여 줄 HTTP 오류로 바꿉니다. 원문은 서버 로그에만 남깁니다. */
function failure(error: unknown) {
  if (!(error instanceof Anthropic.APIError)) return error;
  console.error('AI review request failed:', error.status ?? 'no response', error.message);
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new HttpError(503, 'AI API 키를 사용할 수 없어요. server/.env의 ANTHROPIC_API_KEY를 확인해 주세요.');
  }
  if (error instanceof Anthropic.RateLimitError) return new HttpError(429, 'AI 요청이 몰리고 있어요. 잠시 후 다시 시도해 주세요.');
  if (error instanceof Anthropic.APIConnectionError) return new HttpError(504, 'AI 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
  return new HttpError(502, 'AI 총평을 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
}

export function createClaudeReviewer(client: Anthropic): Reviewer {
  return async input => {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: AI_REVIEW_MODEL,
        max_tokens: 16000,
        // A safety-classifier decline is retried on Anthropic's recommended fallback model within the same call.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        // Explaining numbers the app already computed does not need deep reasoning.
        output_config: { effort: 'low', format: { type: 'json_schema', schema: REVIEW_SCHEMA } },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `이번 기간 집계입니다.\n${JSON.stringify(input)}` }],
      });
    } catch (error) {
      throw failure(error);
    }
    if (response.stop_reason === 'refusal') throw new HttpError(502, 'AI가 이번 요청에는 총평을 쓰지 않았어요. 다시 시도해 주세요.');
    if (response.stop_reason === 'max_tokens') throw unreadable();
    const text = response.content.find((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')?.text;
    return { ...parseReview(text), model: response.model };
  };
}
