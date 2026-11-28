import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReviewInput } from '../src/services/aiReview.js';
import { buildReviewFacts, cautionNote, renderReviewFacts, renderSummaryInput } from '../src/services/reviewFacts.js';

const wellMeasured: ReviewInput = {
    days: 7,
    upper: {
      neck: { current: 78.4, previous: 72.2 }, balance: { current: 85.6, previous: 86.1 },
      measuredMinutes: 200, sessions: 12, deviations: 34, deviationRate: 8.4, validRate: 92,
    },
    eye: { blinkRate: 15.2, previousBlinkRate: 17.4, validMinutes: 65 },
    keyboard: {
      score: 61.5, previousScore: 70.2, coverage: 82, consistency: 93.4, judged: 3420,
      frequentKeys: [{ code: 'KeyA', differentRate: 40.2 }, { code: 'Semicolon', differentRate: 25 }, { code: 'KeyK', differentRate: 12 }],
    },
  };

test('a well-measured period becomes the exact sheet of records and candidates', () => {
  assert.equal(renderReviewFacts(buildReviewFacts(wellMeasured)), [
    '기간: 최근 7일',
    '[기록]',
    '- 목 자세 점수 78점 (직전 7일 72점, 6점 오름)',
    '- 좌우 균형 점수 86점 (직전 7일 86점, 비슷함)',
    '- 상체 측정 시간 3시간 20분, 측정 12회',
    '- 기준 자세에서 2초 넘게 벗어난 횟수 34번',
    '- 제대로 관찰한 시간 중 기준 자세에서 벗어나 있던 시간 8%',
    '- 측정 시간 중 얼굴과 어깨가 보여 분석한 시간 92%',
    '- 분당 깜빡임 15회 (직전 7일 17회, 2회 줄어듦)',
    '- 깜빡임을 제대로 관찰한 시간 1시간 5분',
    '- 타자 훈련 점수 62점 (직전 7일 70점, 8점 내려감)',
    '- 손가락을 판정한 입력 3420회',
    '- 손가락을 판정할 수 있었던 입력 비율 82%',
    '- 같은 키를 같은 손가락으로 누른 비율 93%',
    '- 권장과 다른 손가락을 자주 쓴 키: A 키 40%, ; 키 25%',
    '[잘한 점 후보]',
    '- 목 자세 점수가 78점으로 직전 7일보다 6점 올랐어요.',
    '- 같은 키를 같은 손가락으로 누른 비율이 93%로 꾸준했어요.',
    '- 좌우 균형 점수가 86점으로 높았어요.',
    '- 기준 자세에서 벗어나 있던 시간이 8%로 짧았어요.',
    '- 최근 7일 동안 상체를 12번 측정했어요.',
    '[개선할 점 후보]',
    '- 타자 훈련 점수가 62점으로 직전 7일보다 8점 내려갔어요. 권장 손가락을 떠올리며 천천히 연습해 보세요.',
    '- 자주 다른 손가락을 쓴 키(A 키 40%, ; 키 25%)를 권장 손가락으로 천천히 연습해 보세요.',
  ].join('\n'));
});

test('thin samples acknowledge recording and suggest better measurement without rating posture', () => {
  // Only 55% of the time had the body in view, so the counts of leaving the reference posture are left out too.
  const facts = buildReviewFacts({
    days: 30,
    upper: {
      neck: { current: 50, previous: 70 }, balance: { current: 90, previous: null },
      measuredMinutes: 12, sessions: 1, deviations: 3, deviationRate: 40, validRate: 55,
    },
    eye: null,
    keyboard: { score: 90, previousScore: null, coverage: 40, consistency: 95, judged: 120, frequentKeys: [] },
  });
  assert.deepEqual(facts.records, [
    '목 자세 점수 50점 (직전 30일 70점, 20점 내려감)',
    '좌우 균형 점수 90점 (직전 30일 기록 없음)',
    '상체 측정 시간 12분, 측정 1회',
    '측정 시간 중 얼굴과 어깨가 보여 분석한 시간 55%',
    '타자 훈련 점수 90점 (직전 30일 기록 없음)',
    '손가락을 판정한 입력 120회',
    '손가락을 판정할 수 있었던 입력 비율 40%',
    '같은 키를 같은 손가락으로 누른 비율 95%',
  ]);
  assert.deepEqual(facts.strengths, ['이번 기간에 상체 자세를 1회 측정해 비교할 기록을 남겼어요.']);
  assert.deepEqual(facts.improvements, [
    '카메라에 얼굴과 양쪽 어깨가 모두 보이게 위치를 맞춰 보세요.',
    '손과 키보드가 카메라에 잘 보이게 위치를 맞춰 보세요.',
    '상체 측정을 더 자주, 더 오래 켜 보세요.',
  ]);
  assert.deepEqual(facts.cautions, [
    '얼굴이나 어깨가 카메라에 보이지 않은 시간이 많아(분석한 시간 55%) 상체 점수는 참고용이에요.',
    '상체 측정 시간이 30분이 안 돼 상체 기록은 참고용이에요.',
    '손가락을 판정하지 못한 입력이 많아(판정 가능 40%) 타자 기록은 참고용이에요.',
    '손가락을 판정한 입력이 200회가 안 돼 타자 기록은 참고용이에요.',
  ]);
  assert.equal(cautionNote(facts), '상체·타자 기록은 측정이 부족해 참고용으로 봐 주세요.');
  assert.equal(facts.overview, '최근 30일 동안 목 자세 점수는 20점 내려갔고, 좌우 균형 점수는 90점이었고, 타자 훈련 점수는 90점이었어요.');
});

test('eye-only cards describe observation and comparison without judging the blink rate', () => {
  const changed = buildReviewFacts({ days: 7, upper: null, keyboard: null, eye: { blinkRate: 9, previousBlinkRate: 20, validMinutes: 5 } });
  assert.equal(renderReviewFacts(changed), [
    '기간: 최근 7일',
    '[기록]',
    '- 분당 깜빡임 9회 (직전 7일 20회, 11회 줄어듦)',
    '- 깜빡임을 제대로 관찰한 시간 5분',
    '[잘한 점 후보]',
    '- 눈 깜빡임을 5분 동안 기록했어요.',
    '[개선할 점 후보]',
    '- 다음에도 비슷한 작업을 할 때 측정해 깜빡임 기록을 비교해 보세요.',
    '[해석 주의]',
    '- 깜빡임 관찰 시간이 10분이 안 돼 깜빡임 기록은 참고용이에요.',
  ].join('\n'));
  assert.equal(changed.overview, '최근 7일 동안 분당 깜빡임은 9회로 11회 줄었어요.');
  assert.equal(cautionNote(changed), '깜빡임 기록은 측정이 부족해 참고용으로 봐 주세요.');
  const unknown = buildReviewFacts({ days: 7, upper: null, keyboard: null, eye: { blinkRate: null, previousBlinkRate: null, validMinutes: 0 } });
  assert.deepEqual(unknown.records, ['깜빡임을 제대로 관찰한 시간 0분']);
  assert.deepEqual(unknown.strengths, []);
  assert.deepEqual(unknown.improvements, []);
  assert.equal(unknown.overview, '최근 7일 동안의 기록이에요.');
});

test('changes are judged on the rounded numbers the text shows', () => {
  const facts = buildReviewFacts({
    days: 7, eye: null, keyboard: null,
    upper: {
      neck: { current: 80.4, previous: 78.6 }, balance: { current: 70.5, previous: 72.4 },
      measuredMinutes: 60, sessions: 2, deviations: 0, deviationRate: null, validRate: null,
    },
  });
  // 80 vs 79 and 71 vs 72 both differ by 1 point, below the 2-point "same" range.
  assert.deepEqual(facts.records.slice(0, 2), ['목 자세 점수 80점 (직전 7일 79점, 비슷함)', '좌우 균형 점수 71점 (직전 7일 72점, 비슷함)']);
  assert.deepEqual(facts.strengths, ['목 자세 점수가 80점으로 높았어요.']);
  assert.deepEqual(facts.improvements, ['다음에도 같은 작업을 할 때 자세를 측정해 이번 점수가 이어지는지 확인해 보세요.']);
});

test('a falling score gives one candidate, the advice is not repeated, and areas take turns', () => {
  const facts = buildReviewFacts({
    days: 7, eye: null,
    upper: {
      neck: { current: 58.3, previous: 69.8 }, balance: { current: 64.1, previous: 71.2 },
      measuredMinutes: 240, sessions: 2, deviations: 40, deviationRate: 38, validRate: 90,
    },
    keyboard: { score: 64.5, previousScore: 72.8, coverage: 80, consistency: 75, judged: 2500, frequentKeys: [] },
  });
  assert.deepEqual(facts.improvements, [
    '목 자세 점수가 58점으로 직전 7일보다 12점 내려갔어요. 측정을 시작할 때 기준 자세를 다시 잡아 보세요.',
    '타자 훈련 점수가 65점으로 직전 7일보다 8점 내려갔어요. 권장 손가락을 떠올리며 천천히 연습해 보세요.',
    '좌우 균형 점수가 64점으로 직전 7일보다 7점 내려갔어요.',
    '기준 자세에서 벗어나 있던 시간이 38%예요. 화면을 오래 볼 때 기준 자세를 떠올려 보세요.',
  ]);
  assert.deepEqual(facts.strengths, ['이번 기간에 상체 자세를 2회 측정해 비교할 기록을 남겼어요.']);
});

test('a few judged keystrokes can fill both cards without scoring typing technique', () => {
  const facts = buildReviewFacts({ days: 7, upper: null, eye: null, keyboard: {
    score: 50, previousScore: null, coverage: 100, consistency: null, judged: 3, frequentKeys: [],
  } });
  assert.deepEqual(facts.strengths, ['손가락을 판정할 수 있는 타자 입력을 3회 기록했어요.']);
  assert.deepEqual(facts.improvements, ['다음 타자 연습에서도 비슷한 속도로 입력해 손가락 사용이 일정한지 확인해 보세요.']);
});

test('a summary sees only the highlights and the candidates shown beside it, and the plain summary joins the changes', () => {
  const facts = buildReviewFacts(wellMeasured);
  assert.equal(renderSummaryInput(facts), [
    '기간: 최근 7일',
    '[주요 기록]',
    '- 목 자세 점수 78점 (직전 7일 72점, 6점 오름)',
    '- 좌우 균형 점수 86점 (직전 7일 86점, 비슷함)',
    '- 상체 측정 시간 3시간 20분, 측정 12회',
    '- 분당 깜빡임 15회 (직전 7일 17회, 2회 줄어듦)',
    '- 타자 훈련 점수 62점 (직전 7일 70점, 8점 내려감)',
    '[화면에 함께 보이는 잘한 점]',
    '- 목 자세 점수가 78점으로 직전 7일보다 6점 올랐어요.',
    '- 같은 키를 같은 손가락으로 누른 비율이 93%로 꾸준했어요.',
    '- 좌우 균형 점수가 86점으로 높았어요.',
    '[화면에 함께 보이는 개선할 점]',
    '- 타자 훈련 점수가 62점으로 직전 7일보다 8점 내려갔어요. 권장 손가락을 떠올리며 천천히 연습해 보세요.',
    '- 자주 다른 손가락을 쓴 키(A 키 40%, ; 키 25%)를 권장 손가락으로 천천히 연습해 보세요.',
  ].join('\n'));
  assert.equal(facts.overview,
    '최근 7일 동안 목 자세 점수는 6점 올랐고, 좌우 균형 점수는 직전과 비슷했고, 타자 훈련 점수는 8점 내려갔어요. 분당 깜빡임은 15회로 2회 줄었어요.');
  assert.equal(cautionNote(facts), null);
});

test('without any score the plain summary says how much was measured', () => {
  const facts = buildReviewFacts({
    days: 7, eye: null, keyboard: null,
    upper: {
      neck: { current: null, previous: 72 }, balance: { current: null, previous: 75 },
      measuredMinutes: 22, sessions: 2, deviations: 0, deviationRate: null, validRate: 8,
    },
  });
  assert.equal(facts.overview, '최근 7일 동안 상체를 2번, 22분 측정했어요.');
  assert.deepEqual(facts.highlights, ['상체 측정 시간 22분, 측정 2회']);
  assert.ok(!facts.records.some(line => line.includes('벗어난')));
});
