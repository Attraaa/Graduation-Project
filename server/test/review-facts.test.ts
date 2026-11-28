import assert from 'node:assert/strict';
import test from 'node:test';
import type { DailyReviewInput as ReviewInput } from '../../database/localReview.ts';
import { buildReviewPlan, renderRecord } from '../src/services/reviewFacts.js';
import { buildRangeReviewPlan, renderRangeRecord } from '../src/services/rangeReviewFacts.js';
import { recordedDay } from './review-fixtures.js';

test('selected day describes an actual decline in its last ten measured minutes and retains measured modes', () => {
  const plan = buildReviewPlan(recordedDay);
  assert.deepEqual(plan.sections.map(section => section.key), ['overall', 'upper', 'keyboard', 'eye']);
  assert.match(plan.headline, /마지막 10분에 목 점수가 내려갔어요/);
  assert.match(plan.sections[0].text, /11월 21일.*3회\(총 30분\)/);
  assert.match(plan.sections[0].text, /마지막 10분에 목 점수는 평균 68점.*앞선 구간 평균 90점보다 22점 낮았어요/);
  assert.match(plan.sections[1].text, /좌우 균형 점수 평균 82.3점/);
  assert.match(plan.sections[1].text, /앞선 구간에서 20분, 마지막 10분에서 10분/);
  assert.match(plan.sections[2].text, /1,240회/);
  assert.match(plan.sections[3].text, /분당 평균 14.2회/);
  assert.match(plan.weaknesses[0], /22점 낮았어요/);
  assert.match(plan.goals[0], /턱/);
  assert.equal(plan.focus, 'neck');
  assert.equal(plan.caution, null);

  const record = renderRecord(plan, recordedDay);
  assert.match(record, /선택한 날짜: 2026-11-21/);
  assert.match(record, /0~5분 92점.*25~30분 66점/);
  assert.doesNotMatch(record, /최근 7일|이전 기간|오늘/);
});

test('shallow, missing, and small changes do not become claims about a trend', () => {
  const score = { ...recordedDay.posture!.scores[0], validMinutes: 3,
    beforeLastTen: { mean: 90, validMinutes: 2.7 }, lastTen: { mean: 40, validMinutes: 0.3 }, periods: [] };
  const input: ReviewInput = { ...recordedDay, posture: { ...recordedDay.posture!, scores: [score] }, keyboard: null, eye: null };
  const short = buildReviewPlan(input);
  assert.doesNotMatch(short.headline + short.sections[1].text, /마지막 10분/);
  assert.match(short.strengths[0], /관찰 3분.*목 점수.*82.7점/);
  assert.doesNotMatch(short.strengths.join(' '), /회 측정|기록을 남겼/);
  assert.match(short.caution!, /관찰량이 적어/);
  assert.equal(short.focus, 'neck');
  assert.match(short.goals[0], /관찰 3분.*82.7점.*턱/);
  const unobserved = buildReviewPlan({ ...input, posture: { ...input.posture!, scores: [{ ...score, lastTen: null }] } });
  assert.deepEqual(unobserved.weaknesses, []);
  assert.equal(unobserved.focus, 'neck');
  const stable = buildReviewPlan({ ...input, posture: { ...input.posture!, scores: [recordedDay.posture!.scores[1]] } });
  assert.match(stable.sections[1].text, /앞선 구간 평균 82점과 비슷했어요/);
  assert.match(stable.strengths[0], /좌우 균형 점수.*82.3점/);
});

test('day with only blinking reports observations without grading frequency', () => {
  const onlyEye: ReviewInput = { date: recordedDay.date, posture: null, keyboard: null, eye: { blinkRate: 8, validMinutes: 4 } };
  const facts = buildReviewPlan(onlyEye);
  assert.match(facts.sections[1].text, /분당 평균 8회/);
  assert.deepEqual(facts.strengths, []);
  assert.deepEqual(facts.weaknesses, []);
  assert.match(facts.goals[0], /기록 비교/);
  assert.match(facts.caution!, /깜빡임 기록/);
});

test('range distinguishes a previous day from a previous measured day and gives advice with the matching evidence', () => {
  const day = (date: string, mean: number, policyVersion = 'neck-v1') => ({
    date, eye: null, keyboard: null, posture: { sessions: 5, measuredMinutes: 15, scores: [
      { metric: 'neck' as const, mean, validMinutes: 12, policyVersion, beforeLastTen: null, lastTen: null, periods: [] },
    ] },
  });
  const range = { from: '2026-11-21', to: '2026-11-25', days: [
    day('2026-11-21', 90), day('2026-11-22', 70), day('2026-11-24', 62), day('2026-11-25', 100, 'neck-v2'),
  ] };
  const plan = buildRangeReviewPlan(range);
  assert.match(plan.evidence, /11월 22일.*70점.*전일 대비 \(90점\) 20점 내려/);
  assert.match(plan.sections[1].text, /직전 측정일인 11월 22일 대비 \(70점\) 8점 내려/);
  assert.doesNotMatch(plan.sections[1].text, /38점 올라/);
  assert.match(plan.goals[0], /20점 내려.*턱/);
  assert.match(plan.strengths[0], /11월 21일.*90점/);
  assert.doesNotMatch(plan.strengths.join(' '), /회 측정|기록을 남겼/);
  assert.match(plan.caution!, /없는 1일/);
  assert.doesNotMatch(renderRangeRecord(plan, range), /neck-v[12]/);
});

test('whole-day chronology combines every bucket using valid observation time and fits the mini PC request', () => {
  const period = (mean: number, validMinutes: number, index: number) => ({
    startMinute: index * 5, endMinute: (index + 1) * 5, mean, validMinutes,
  });
  const periods = Array.from({ length: 300 }, (_, i) => i % 2 ? period(100, 2, i) : period(0, 3, i));
  const input: ReviewInput = { ...recordedDay, posture: { sessions: 300, measuredMinutes: 1500,
    scores: (['neck', 'balance', 'shoulder'] as const).map(metric => ({
      metric, mean: 40, validMinutes: 750, beforeLastTen: { mean: 40, validMinutes: 745 }, lastTen: { mean: 40, validMinutes: 5 }, periods,
    })) } };
  const record = renderRecord(buildReviewPlan(input), input);
  assert.match(record, /0~250분 40점\(관찰 125분\)/);
  assert.match(record, /1250~1500분 40점\(관찰 125분\)/);
  assert.ok(Buffer.byteLength(JSON.stringify({ record })) < 6500);
});
