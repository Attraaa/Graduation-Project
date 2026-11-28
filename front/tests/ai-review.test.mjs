import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { aiReviewInput, inputDetails, inputRows } from '../src/features/ai-review/input.ts';

const bundle = await build({ entryPoints: ['src/features/ai-review/ReviewCards.tsx'], bundle: true, write: false, logLevel: 'error',
  platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const ReviewCards = compiled.exports.default;

const dates = ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'];
const none = { current: null, previous: null, change: null };
const summary = ({ upper = {}, eye = {}, days = [] } = {}) => ({
  range: { from: '2026-10-04', to: '2026-10-17', dates, previousDates: [] }, days, upperFloor: 0, eyeMax: 20,
  upper: { present: false, turtle: none, balance: none, runMs: 0, sessions: 0, averageMs: null, longestMs: 0,
    deviations: 0, deviationRate: null, validRate: null, unmeasuredMs: 0, hourly: [], hourlyFloor: 0, deviationHours: [], ...upper },
  eye: { present: false, rate: null, previousRate: null, validMs: 0, runMs: 0, breaks: 0, nearReminders: 0, openReminders: 0,
    validRate: null, hourly: [], hourlyMax: 20, ...eye },
});
const record = (policyVersion, counts) => ({ counts, record: { id: policyVersion, owner: '1', startedAt: 0, updatedAt: 0, offsetMinutes: -540,
  status: 'finished', policyVersion, recognitionVersion: 'hands-label-distance-v2', nearbyCredit: 70, total: 0 } });
const count = (date, code, verdict, n) => ({ date, code, context: 'plain', finger: 'left:index', verdict, reason: verdict, count: n });

test('nothing measured in the period means nothing to send', () => {
  assert.equal(aiReviewInput(summary(), [], 7), null);
  // Keyboard counts from the previous period alone do not make a current keyboard section.
  assert.equal(aiReviewInput(summary(), [record('p1', [count('2026-10-05', 'KeyA', 'preferred', 20)])], 7), null);
});

test('upper body and eye values are the Statistics numbers, rounded, with minutes instead of milliseconds', () => {
  const input = aiReviewInput(summary({
    upper: { present: true, turtle: { current: 82.44, previous: 78.06, change: 4 }, balance: { current: 100.0000001, previous: null, change: null },
      runMs: 12_030_000, sessions: 4, deviations: 12, deviationRate: 8.25, validRate: 91.04 },
    eye: { present: true, rate: 14.26, previousRate: null, validMs: 9_000_000 },
  }), [], 30);
  assert.deepEqual(input, {
    days: 30, measuredDays: 0, daily: [],
    upper: { neck: { current: 82.4, previous: 78.1 }, balance: { current: 100, previous: null }, measuredMinutes: 200.5,
      sessions: 4, deviations: 12, deviationRate: 8.3, validRate: 91, longestMinutes: 0, hourly: [], deviationHours: [] },
    eye: { blinkRate: 14.3, previousBlinkRate: null, validMinutes: 150 },
    keyboard: null,
  });
});

test('keyboard uses only the latest policy group and names at most three keys with at least ten judged presses', () => {
  const current = '2026-10-15', previous = '2026-10-05';
  const input = aiReviewInput(summary(), [
    record('old-policy', [count(current, 'KeyQ', 'mismatch', 50)]),
    record('new-policy', [
      count(previous, 'KeyA', 'preferred', 10),
      count(current, 'KeyA', 'preferred', 10), count(current, 'KeyA', 'mismatch', 5),
      count(current, 'KeyS', 'preferred', 3), count(current, 'KeyS', 'nearby', 2),
      count(current, 'KeyD', 'preferred', 20), count(current, 'KeyD', 'nearby', 10),
      count(current, 'KeyF', 'preferred', 12), count(current, 'KeyJ', 'mismatch', 12), count(current, 'KeyK', 'nearby', 11),
    ]),
  ], 7);
  assert.equal(input.upper, null);
  assert.equal(input.eye, null);
  assert.deepEqual(input.keyboard, {
    score: 71.9, previousScore: 100, coverage: 100, consistency: 100, judged: 85,
    frequentKeys: [{ code: 'KeyJ', differentRate: 100 }, { code: 'KeyK', differentRate: 100 }, { code: 'KeyD', differentRate: 33.3 }],
  });
});

test('the request is shown in words before it is sent, with readable key names', () => {
  const rows = inputRows({ days: 7, upper: null, eye: { blinkRate: null, previousBlinkRate: 12, validMinutes: 0.4 },
    keyboard: { score: 71.88, previousScore: null, coverage: 88, consistency: null, judged: 85,
      frequentKeys: [{ code: 'KeyJ', differentRate: 100 }, { code: 'Semicolon', differentRate: 33.3 }] } });
  assert.deepEqual(rows.map(row => row.mode), ['eye', 'keyboard']);
  assert.equal(rows[0].text, '깜빡임 자료 부족 (직전 분당 12회) · 유효 관찰 1분 미만');
  assert.equal(rows[1].text, '훈련 점수 71.9 · 판정 가능 88% · 일관성 — · 판정 85회 · 자주 다른 키 J 100%, ; 33%');
});

test('daily scores, hourly scores and deviation hours go along, and are listed before sending', () => {
  const day = (date, turtle, balance, score, hasRecords = true) => ({ date, hasRecords, upper: { turtle, balance }, keyboard: { score } });
  const input = aiReviewInput(summary({
    days: [day('2026-10-16', null, null, null, false), day('2026-10-17', 81.26, 84, 77.04)],
    upper: { present: true, turtle: { current: 81.26, previous: null, change: null }, balance: { current: 84, previous: null, change: null },
      runMs: 600_000, sessions: 1, longestMs: 420_000,
      hourly: [{ hour: 9, turtle: 80.04, balance: null }, { hour: 10, turtle: null, balance: null }],
      deviationHours: [{ hour: 9, count: 3, strong: true, observedMs: 1_620_000 }, { hour: 10, count: 0, strong: false, observedMs: 0 }] },
  }), [], 7);
  assert.equal(input.measuredDays, 1);
  assert.deepEqual(input.daily, [{ date: '2026-10-16', neck: null, side: null, keyboard: null }, { date: '2026-10-17', neck: 81.3, side: 84, keyboard: 77 }]);
  assert.deepEqual([input.upper.longestMinutes, input.upper.hourly, input.upper.deviationHours],
    [7, [{ hour: 9, neck: 80, balance: null }, { hour: 10, neck: null, balance: null }], [{ hour: 9, count: 3, minutes: 27 }, { hour: 10, count: 0, minutes: 0 }]]);
  assert.deepEqual(inputDetails(input), [
    { label: '측정한 날', text: '7일 중 1일' },
    { label: '날짜별 점수', text: '10월 16일 기록 없음, 10월 17일 목 81·좌우 균형 84·키보드 77' },
    { label: '시간대별 점수', text: '9시 목 80·좌우 균형 —, 10시 목 —·좌우 균형 —' },
    { label: '기준 이탈 시간대', text: '9시 3회(관찰 27분), 10시 0회(관찰 0분)' },
  ]);
  assert.match(inputRows(input)[0].text, /가장 길게 이어진 측정 7분$/);
});

test('device summaries list their hours with observed minutes and keep the old shoulder label', () => {
  const localPosture = { sideMetric: 'shoulder', sessions: 3, measuredMinutes: 95, longestMinutes: 40,
    neck: { current: 80.4, previous: null }, side: { current: 86, previous: null }, latestNeckBand: null,
    hourly: [{ hour: 9, neck: 84, side: 88, minutes: 40 }] };
  const input = { days: 7, measuredDays: 2, daily: [{ date: '2026-10-17', neck: 80.4, side: 86, keyboard: null }], localPosture, upper: null, eye: null, keyboard: null };
  assert.deepEqual(inputDetails(input).slice(1), [
    { label: '날짜별 점수', text: '10월 17일 목 80·어깨 86' },
    { label: '시간대별 점수', text: '9시 목 84·어깨 88(관찰 40분)' },
  ]);
  assert.match(inputRows(input)[0].text, /가장 길게 이어진 측정 40분/);
});

const review = {
  headline: '목 점수가 오른 한 주였어요.',
  sections: [
    { key: 'overall', title: '최근 7일 총평', text: '최근 7일 중 5일 동안 측정했어요. 화면을 볼 때 턱이 앞으로 나오는지 가끔 확인해 보세요.' },
    { key: 'upper', title: '목·좌우 균형', text: '목 점수는 평균 81점이었어요.' },
    { key: 'keyboard', title: '키보드', text: '손가락을 판정한 입력은 1,240회였어요.' },
  ],
  strengths: ['측정을 꾸준히 켰어요.'], weaknesses: [], goals: ['B 키를 권장 손가락으로 천천히 연습하기'],
  caution: '키보드 기록은 측정이 부족해 참고용으로 봐 주세요.', model: 'gemma3:4b', adviceSource: 'model', generatedAt: '2026-11-28T05:12:00.000Z',
};

test('a review shows the headline, the overall and area paragraphs, then strengths, weaknesses and goals, without generation metadata', () => {
  const out = renderToStaticMarkup(createElement(ReviewCards, { review }));
  for (const title of ['총평', '목·좌우 균형', '키보드', '잘한 점', '아쉬운 점', '다음 목표']) assert.match(out, new RegExp(`<section aria-label="${title}"`));
  assert.ok(out.indexOf('목 점수가 오른 한 주였어요.') < out.indexOf('최근 7일 중 5일 동안 측정했어요.'));
  assert.match(out, /최근 7일 총평/);
  assert.match(out, /<li[^>]*>B 키를 권장 손가락으로 천천히 연습하기<\/li>/);
  assert.match(out, /이번 총평에는 따로 꼽은 내용이 없어요/);
  assert.match(out, /키보드 기록은 측정이 부족해 참고용으로 봐 주세요\./);
  assert.doesNotMatch(out, /gemma3:4b|기본 습관 제안/);
  const fallback = renderToStaticMarkup(createElement(ReviewCards, { review: { ...review, adviceSource: 'record', caution: null } }));
  assert.match(fallback, /측정 기록에 맞춘 기본 습관 제안을 표시했어요/);
  assert.doesNotMatch(fallback, /참고용/);
});
