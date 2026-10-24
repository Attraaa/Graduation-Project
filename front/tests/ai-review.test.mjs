import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { aiReviewInput, inputRows } from '../src/features/ai-review/input.ts';

const bundle = await build({ entryPoints: ['src/features/ai-review/ReviewCards.tsx'], bundle: true, write: false, logLevel: 'error',
  platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const ReviewCards = compiled.exports.default;

const dates = ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'];
const none = { current: null, previous: null, change: null };
const summary = ({ upper = {}, eye = {} } = {}) => ({
  range: { from: '2026-10-04', to: '2026-10-17', dates, previousDates: [] }, days: [], upperFloor: 0, eyeMax: 20,
  upper: { present: false, turtle: none, shoulder: none, runMs: 0, sessions: 0, averageMs: null, longestMs: 0,
    deviations: 0, deviationRate: null, validRate: null, unmeasuredMs: 0, hourly: [], hourlyFloor: 0, ...upper },
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
    upper: { present: true, turtle: { current: 82.44, previous: 78.06, change: 4 }, shoulder: { current: 100.0000001, previous: null, change: null },
      runMs: 12_030_000, sessions: 4, deviations: 12, deviationRate: 8.25, validRate: 91.04 },
    eye: { present: true, rate: 14.26, previousRate: null, validMs: 9_000_000 },
  }), [], 30);
  assert.deepEqual(input, {
    days: 30,
    upper: { neck: { current: 82.4, previous: 78.1 }, shoulder: { current: 100, previous: null }, measuredMinutes: 200.5,
      sessions: 4, deviations: 12, deviationRate: 8.3, validRate: 91 },
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

test('a review shows the summary, both lists and the reference-only note', () => {
  const out = renderToStaticMarkup(createElement(ReviewCards, { review: { summary: '이번 주는 목 점수가 올랐어요.',
    strengths: ['측정을 꾸준히 켰어요.'], improvements: [], model: 'claude-opus-5-5', generatedAt: '2026-10-17T05:12:00.000Z' } }));
  for (const title of ['총평', '잘한 점', '개선할 점']) assert.match(out, new RegExp(`<section aria-label="${title}"`));
  assert.match(out, /이번 주는 목 점수가 올랐어요\./);
  assert.match(out, /<li[^>]*>측정을 꾸준히 켰어요\.<\/li>/);
  assert.match(out, /이번 총평에는 따로 꼽은 내용이 없어요/);
  assert.match(out, /claude-opus-5-5 · .+ 생성 · AI가 기록 수치만 보고 쓴 참고용 문장이에요\. 의학적 판단이 아니며 저장하지 않아요\./);
});
