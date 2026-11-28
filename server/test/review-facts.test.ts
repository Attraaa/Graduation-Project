import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReviewInput } from '../src/services/aiReview.js';
import { buildReviewPlan, renderRecord } from '../src/services/reviewFacts.js';
import { dates, deviceWeek, hours, keyboardMonth, thin, week } from './review-fixtures.js';

const text = (input: ReviewInput, key: string) => buildReviewPlan(input).sections.find(section => section.key === key)?.text;

test('a well-measured week reads as a headline, four paragraphs and three lists, all from the numbers', () => {
  const plan = buildReviewPlan(week);
  assert.equal(plan.headline, '목 점수와 키보드 점수가 함께 오른 한 주였어요.');
  assert.deepEqual(plan.sections.map(section => section.title), ['최근 7일 총평', '목·좌우 균형', '키보드', '깜빡임']);
  assert.equal(text(week, 'overall'), '최근 7일 중 6일 동안 측정해 상체를 모두 16시간(32번) 기록했어요. 키보드는 입력 1,240회를 판정했어요. '
    + '목 점수는 81점으로 직전 7일(73점)보다 8점 올랐고, 좌우 균형 점수는 83점으로 직전 7일(84점)과 비슷했어요. '
    + '키보드 훈련 점수는 82점으로 직전 7일(78점)보다 4점 올랐어요. 세 점수 중 목 점수가 가장 크게 올랐어요. 분당 깜빡임은 14회로 2회 줄었어요. '
    + '다만 오후 3시 무렵에는 기준 자세에서 벗어나는 일이 다른 시간보다 잦았어요.');
  assert.equal(text(week, 'upper'), '목 점수는 평균 81점, 좌우 균형 점수는 평균 83점이었어요. '
    + '날짜별로 보면 목 점수는 금요일이 84점으로 가장 높았고, 월요일이 76점으로 가장 낮았어요. 기간 뒤쪽으로 갈수록 점수가 올랐어요. '
    + '기준 자세에서 벗어난 일은 47번이었고, 벗어나 있던 시간은 제대로 관찰한 시간의 3%였어요. '
    + '관찰한 시간에 비해 벗어나는 일은 오후 3시 무렵에 가장 잦아서 1시간에 6번꼴이었어요. 전체 평균은 1시간에 3번꼴이었어요. '
    + '시간대별로는 오전 9시 무렵 점수가 가장 높고 오후 3시 무렵이 가장 낮았어요. '
    + '한 번에 가장 길게 이어서 측정한 시간은 12분이었어요.');
  assert.equal(text(week, 'keyboard'), '손가락을 판정한 입력은 1,240회였고, 훈련 점수는 평균 82점이었어요. '
    + '날짜별로는 금요일이 85점으로 가장 높았고, 월요일이 78점으로 가장 낮았어요. 같은 키를 같은 손가락으로 누른 비율은 88%였어요. '
    + '권장과 다른 손가락을 자주 쓴 키는 B 키(42%)와 Y 키(31%)였어요. 손가락을 판정할 수 있었던 입력은 71%였어요. '
    + '손과 키보드가 카메라에 잘 보이게 맞추면 더 많은 입력을 판정할 수 있어요.');
  assert.equal(text(week, 'eye'), '깜빡임을 제대로 관찰한 시간은 5시간이었고, 그동안 분당 14회 깜빡였어요. '
    + '직전 7일(분당 16회)보다 2회 줄었어요. 깜빡임 횟수는 점수가 아니라 참고 기록이에요.');
  assert.deepEqual(plan.strengths, ['목 점수가 81점으로 직전 7일보다 8점 올랐어요.', '좌우 균형 점수가 83점으로 높게 유지됐어요.',
    '키보드 훈련 점수가 82점으로 직전 7일보다 4점 올랐어요.']);
  assert.deepEqual(plan.weaknesses, ['오후 3시 무렵에 기준 자세에서 벗어나는 일이 다른 시간보다 잦았어요.', 'B 키(42%)와 Y 키(31%)에서 권장과 다른 손가락을 자주 썼어요.']);
  assert.deepEqual(plan.goals, ['오후 3시 무렵에 한 번씩 기준 자세 확인하기(오버레이를 켜 두면 점수를 바로 볼 수 있어요)', 'B 키와 Y 키를 권장 손가락으로 천천히 연습하기']);
  assert.equal(plan.caution, null);
});

test('a week measured on this device uses the device summary: no deviation counts, but days, hours, the longest session and the latest band', () => {
  const plan = buildReviewPlan(deviceWeek);
  assert.equal(plan.headline, '목 점수가 오른 한 주였어요.');
  assert.equal(text(deviceWeek, 'overall'), '최근 7일 중 5일 동안 측정해 상체를 이 기기에서 모두 5시간 40분(9번) 기록했어요. '
    + '목 점수는 80점으로 직전 7일(76점)보다 4점 올랐고, 좌우 균형 점수는 86점으로 직전 7일(87점)과 비슷했어요. '
    + '두 점수 중 목 점수가 가장 크게 올랐어요. 기간 뒤쪽으로 갈수록 목 점수가 올랐어요.');
  assert.equal(text(deviceWeek, 'upper'), '목 점수는 평균 80점, 좌우 균형 점수는 평균 86점이었어요. '
    + '목 점수가 좌우 균형 점수보다 6점 낮아서, 목 자세를 조금 더 신경 쓰면 좋아요. '
    + '날짜별로 보면 목 점수는 금요일이 83점으로 가장 높았고, 월요일이 74점으로 가장 낮았어요. 기간 뒤쪽으로 갈수록 점수가 올랐어요. '
    + '시간대별로는 오전 9시 무렵 점수가 가장 높고 오후 4시 무렵이 가장 낮았어요. 한 번에 가장 길게 이어서 측정한 시간은 55분이었어요. '
    + '가장 최근 측정에서는 목 점수가 80~85점인 구간이 유효 관찰 시간의 64%로 가장 길었어요.');
  assert.doesNotMatch(plan.sections.map(section => section.text).join(' '), /벗어난 일|벗어나는 일/);
  assert.deepEqual(plan.strengths, ['목 점수가 80점으로 직전 7일보다 4점 올랐어요.', '좌우 균형 점수가 86점으로 높게 유지됐어요.', '7일 중 5일을 측정했어요.']);
  assert.deepEqual([plan.weaknesses, plan.goals], [[], ['다음에도 같은 작업을 할 때 측정해 이번 점수가 이어지는지 확인하기']]);
  // Older device records were measured with the shoulder score and keep that name.
  const shoulder: ReviewInput = { ...deviceWeek, localPosture: { ...deviceWeek.localPosture!, sideMetric: 'shoulder' } };
  assert.deepEqual(buildReviewPlan(shoulder).sections.map(section => section.title), ['최근 7일 총평', '목·어깨']);
  assert.match(text(shoulder, 'upper')!, /어깨 자세 점수는 평균 86점/);
  assert.doesNotMatch(buildReviewPlan(shoulder).sections.map(section => section.text).join(' '), /좌우 균형/);
});

test('a thin period says so once, judges nothing it cannot trust and turns the gaps into goals', () => {
  const plan = buildReviewPlan(thin);
  assert.equal(plan.headline, '2일 동안 기록을 쌓은 한 주였어요.');
  assert.equal(text(thin, 'overall'), '최근 7일 중 2일 동안 측정해 상체를 모두 22분(2번) 기록했어요. 목 점수는 64점이었고, 좌우 균형 점수는 71점이었어요. '
    + '직전 7일 기록이 없어 이번에는 변화를 비교하지 않았어요.');
  assert.equal(text(thin, 'upper'), '상체 측정 시간이 22분으로 짧고 얼굴과 어깨가 보여 분석한 시간도 62%뿐이라, 아래 내용은 참고로만 봐 주세요. '
    + '목 점수는 평균 64점, 좌우 균형 점수는 평균 71점이었어요. 목 점수가 좌우 균형 점수보다 7점 낮아서, 목 자세를 조금 더 신경 쓰면 좋아요. '
    + '한 번에 가장 길게 이어서 측정한 시간은 6분이었어요.');
  // Leaving the reference posture is not counted when the camera saw too little, and a 34% share is not called long from 22 minutes.
  assert.doesNotMatch(plan.sections.map(section => section.text).join(' '), /벗어난 일은/);
  assert.deepEqual(plan.strengths, ['이번 기간에 상체 자세를 2번 측정해 비교할 기록을 남겼어요.']);
  assert.deepEqual(plan.weaknesses, ['7일 중 2일만 측정했어요.', '얼굴이나 어깨가 카메라에 보이지 않은 시간이 많았어요.']);
  assert.deepEqual(plan.goals, ['측정하는 날을 4일 이상으로 늘리기', '카메라에 얼굴과 양쪽 어깨가 모두 보이게 위치 맞추기']);
  assert.equal(plan.caution, '상체 기록은 측정이 부족해 참고용으로 봐 주세요.');
});

test('a month of keyboard practice puts the drop first and keeps the goals to three', () => {
  const plan = buildReviewPlan(keyboardMonth);
  assert.equal(plan.headline, '키보드 점수가 조금 내려간 한 달이었어요.');
  assert.equal(text(keyboardMonth, 'overall'), '최근 30일 중 9일 동안 측정해 키보드 입력 5,210회를 판정했어요. '
    + '키보드 훈련 점수는 66점으로 직전 30일(72점)보다 6점 내려갔어요.');
  assert.deepEqual(plan.sections.map(section => section.key), ['overall', 'keyboard']);
  assert.deepEqual(plan.strengths, ['같은 키를 같은 손가락으로 누른 비율이 93%로 꾸준했어요.']);
  assert.deepEqual(plan.weaknesses, ['키보드 훈련 점수가 66점으로 직전 30일보다 6점 내려갔어요.', '; 키(38%)에서 권장과 다른 손가락을 자주 썼어요.', '30일 중 9일만 측정했어요.']);
  assert.deepEqual(plan.goals, ['권장 손가락을 떠올리며 천천히 타자 연습하기', '; 키를 권장 손가락으로 천천히 연습하기', '측정하는 날을 15일 이상으로 늘리기']);
});

test('a short blink-only period states the rate and the change without judging them, and still names what was recorded', () => {
  const eyeOnly: ReviewInput = { days: 7, measuredDays: null, daily: [], upper: null, keyboard: null, eye: { blinkRate: 9, previousBlinkRate: 14, validMinutes: 7 } };
  const plan = buildReviewPlan(eyeOnly);
  assert.equal(text(eyeOnly, 'overall'), '최근 7일 동안 깜빡임을 관찰했어요. 분당 깜빡임은 9회로 5회 줄었어요.');
  assert.equal(text(eyeOnly, 'eye'), '깜빡임을 관찰한 시간이 짧아서 아래 내용은 참고로만 봐 주세요. 깜빡임을 제대로 관찰한 시간은 7분이었고, 그동안 분당 9회 깜빡였어요. '
    + '직전 7일(분당 14회)보다 5회 줄었어요. 깜빡임 횟수는 점수가 아니라 참고 기록이에요.');
  assert.doesNotMatch(plan.sections.map(section => section.text).join(' '), /좋|나쁘|개선|주의가/);
  assert.deepEqual([plan.strengths, plan.weaknesses, plan.goals, plan.caution],
    [['눈 깜빡임을 7분 동안 기록했어요.'], [], ['다음에도 비슷한 작업을 할 때 측정해 깜빡임 기록 비교하기'], '깜빡임 기록은 측정이 부족해 참고용으로 봐 주세요.']);
});

test('requests from app builds before the daily and hourly values still get a review, without day or hour sentences', () => {
  const old: ReviewInput = { ...week, measuredDays: null, daily: [], upper: { ...week.upper!, longestMinutes: null, hourly: [], deviationHours: [] } };
  const all = buildReviewPlan(old).sections.map(section => section.text).join(' ');
  assert.match(all, /^최근 7일 동안 상체를 모두 16시간\(32번\) 측정했어요\./);
  assert.doesNotMatch(all, /요일|무렵|시간대별|가장 길게|7일 중/);
  assert.deepEqual(buildReviewPlan(old).goals, ['B 키와 Y 키를 권장 손가락으로 천천히 연습하기']);
});

test('a busy hour is judged by deviations per hour of observation, not by counts that only follow how long each hour was measured', () => {
  type Hour = { hour: number; count: number; minutes: number };
  const upper = (deviationHours: Hour[], hourly = week.upper!.hourly) => ({ ...week, upper: { ...week.upper!, deviationHours, hourly } });
  const busy = (deviationHours: Hour[]) => text(upper(deviationHours), 'upper')!;
  // Most deviations at 15:00, but 15:00 was also measured three times as long: the same rate everywhere is not a busy hour.
  assert.doesNotMatch(busy([{ hour: 9, count: 4, minutes: 60 }, { hour: 15, count: 12, minutes: 180 }]), /잦아서/);
  assert.doesNotMatch(busy([{ hour: 9, count: 1, minutes: 60 }, { hour: 15, count: 3, minutes: 60 }]), /잦아서/); // fewer than five
  assert.doesNotMatch(busy([{ hour: 9, count: 1, minutes: 120 }, { hour: 23, count: 9, minutes: 20 }]), /잦아서/); // 20 minutes is too little to compare
  assert.match(busy([{ hour: 9, count: 2, minutes: 120 }, { hour: 23, count: 8, minutes: 60 }]), /저녁 11시 무렵에 가장 잦아서 1시간에 8번꼴이었어요\. 전체 평균은 1시간에 3번꼴이었어요\./);
  // An hour observed too briefly is not called the best or the worst either.
  const brief = busy([{ hour: 9, count: 0, minutes: 10 }, ...hours.slice(1).map(hour => ({ hour, count: 0, minutes: 60 }))]);
  assert.match(brief, /시간대별로는 오전 10시 무렵 점수가 가장 높고 오후 3시 무렵이 가장 낮았어요\./);
  assert.doesNotMatch(text(upper([], hours.map(hour => ({ hour, neck: 80, balance: 81 }))), 'upper')!, /시간대별로는/);
  const flat = { ...week, daily: dates.map(date => ({ date, neck: 80, side: 80, keyboard: null })) };
  assert.match(text(flat, 'upper')!, /날마다 점수가 크게 달라지지 않았어요\./);
  assert.doesNotMatch(text(flat, 'upper')!, /가장 높았고/);
});

test('the record for the mini PC carries the headline, the overall sentences and the lists shown beside them', () => {
  const plan = buildReviewPlan(week);
  const lines = renderRecord(plan).split('\n');
  assert.deepEqual(lines.slice(0, 3), ['기간: 최근 7일', '[주요 기록]', `- ${plan.headline}`]);
  assert.ok(lines.includes('- 세 점수 중 목 점수가 가장 크게 올랐어요.'));
  assert.ok(lines.includes('[화면에 함께 보이는 잘한 점]') && lines.includes(`- ${plan.strengths[0]}`));
  assert.ok(lines.includes('[화면에 함께 보이는 개선할 점]') && lines.includes(`- ${plan.weaknesses[0]}`) && lines.includes(`- ${plan.goals[0]}`));
});
