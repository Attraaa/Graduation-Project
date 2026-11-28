import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildDailyReviewInput, inputRows } from '../src/features/ai-review/input.ts';

const bundle = await build({ entryPoints: ['src/features/ai-review/ReviewCards.tsx'], bundle: true, write: false, logLevel: 'error',
  platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const ReviewCards = compiled.exports.default;
const eyeBundle = await build({ entryPoints: ['src/features/ai-review/dailyEye.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { loadDailyEye } = await import('data:text/javascript;base64,' + Buffer.from(eyeBundle.outputFiles[0].text).toString('base64'));

const date = '2026-11-28', yesterday = '2026-11-27';
const record = (nearbyCredit, counts) => ({ counts, record: { nearbyCredit } });
const count = (date, code, verdict, n) => ({ date, code, context: 'plain', finger: 'left:index', verdict, reason: verdict, count: n });
const eye = (date, validMs, blinks) => ({ date, validMs, blinks });

test('only the selected date can enable the review', () => {
  assert.equal(buildDailyReviewInput(date, null, [], []), null);
  assert.equal(buildDailyReviewInput(date, null, [eye(yesterday, 60_000, 14)],
    [record(70, [count(yesterday, 'KeyA', 'preferred', 20)])]), null);
});

test('every observation on the selected date contributes to the frequency, regardless of session', () => {
  const result = buildDailyReviewInput(date, null, [eye(date, 60_000, 12), eye(date, 120_000, 30), eye(yesterday, 60_000, 100)], []);
  assert.deepEqual(result, { date, posture: null, keyboard: null, eye: { blinkRate: 14, validMinutes: 3 } });
  assert.deepEqual(buildDailyReviewInput(date, null, [eye(date, 15_000, 3)], []).eye, { blinkRate: null, validMinutes: 0.25 });
});

function mockEyeApi(t, responder) {
  const fetch = globalThis.fetch;
  globalThis.localStorage = { getItem: () => JSON.stringify({ token: 'eye-test', user: { id: '1' } }) };
  globalThis.fetch = async (path, options) => {
    assert.equal(options.headers.Authorization, 'Bearer eye-test');
    options.signal.throwIfAborted();
    return responder(new URL(path, 'https://example.test'));
  };
  t.after(() => { globalThis.fetch = fetch; delete globalThis.localStorage; });
}

const localEye = (id, validMs, blinks) => ({ id, rows: [eye(date, validMs, blinks)] });
const detailEye = (status, validMs, blinks) => Response.json({
  record: { status, offsetMinutes: -540 },
  buckets: [{ minute: Date.parse(date + 'T09:00:00+09:00'), validMs, blinks }],
});

test('eye totals include all sessions, counting complete, pending and local-only observations once', async t => {
  mockEyeApi(t, url => {
    if (url.pathname.endsWith('/done')) return detailEye('finished', 60_000, 10);
    if (url.pathname.endsWith('/pending')) return detailEye('running', 20_000, 3);
    if (url.pathname.endsWith('/unsynced')) return Response.json({}, { status: 404 });
    assert.equal(url.searchParams.get('from'), date);
    assert.equal(url.searchParams.get('to'), date);
    return Response.json([eye(date, 200_000, 33)]);
  });
  const signal = new AbortController().signal;
  const local = [localEye('done', 60_000, 10), localEye('pending', 50_000, 8), localEye('unsynced', 10_000, 2)];
  assert.deepEqual(await loadDailyEye('1', date, local, signal), [eye(date, 240_000, 40)]);
  await assert.rejects(loadDailyEye('2', date, local, signal), /계정/);
});

test('an eye session that syncs during the aggregate read is reconciled against the fresh cloud totals', async t => {
  let reads = 0;
  mockEyeApi(t, url => {
    if (url.pathname.endsWith('/saving')) return reads === 0 ? Response.json({}, { status: 404 }) : detailEye('finished', 30_000, 6);
    return Response.json(++reads === 1 ? [eye(date, 60_000, 9)] : [eye(date, 90_000, 15)]);
  });
  const result = await loadDailyEye('1', date, [localEye('saving', 30_000, 6)], new AbortController().signal);
  assert.deepEqual(result, [eye(date, 90_000, 15)]);
  assert.equal(reads, 2);
});

test('keyboard combines selected-date sessions using the credits applied to each press', () => {
  const result = buildDailyReviewInput(date, null, [], [
    record(70, [
      count(yesterday, 'KeyZ', 'preferred', 500),
      count(date, 'KeyA', 'preferred', 10), count(date, 'KeyA', 'nearby', 5), count(date, 'KeyA', 'mismatch', 5),
    ]),
    record(50, [count(date, 'KeyB', 'preferred', 5), count(date, 'KeyB', 'nearby', 5), count(date, 'KeyB', 'mismatch', 10)]),
  ]);
  assert.deepEqual(result.keyboard, { score: 52.5, judged: 40, coverage: 100, consistency: 100,
    frequentKeys: [{ code: 'KeyB', differentRate: 75 }, { code: 'KeyA', differentRate: 50 }] });
});

test('the selected-date preview preserves separate balance and older shoulder labels', () => {
  const score = (metric, mean) => ({ metric, mean, validMinutes: 10, beforeLastTen: null, lastTen: null, periods: [] });
  const posture = { sessions: 3, measuredMinutes: 29.7, scores: [score('neck', 85.5), score('balance', 75), score('shoulder', 60)] };
  const rows = inputRows({ date, posture, keyboard: null, eye: { blinkRate: null, validMinutes: 0.4 } });
  assert.deepEqual(rows, [
    { mode: 'upper', name: '상체', text: '목 85.5점 · 좌우 균형 75점 · 어깨 60점 · 측정 30분 · 3회' },
    { mode: 'eye', name: '안구', text: '깜빡임 자료 부족 · 유효 관찰 1분 미만' },
  ]);
});

const review = {
  headline: '마지막 10분에 목 점수가 내려갔어요.',
  sections: [
    { key: 'overall', title: '11월 28일 총평', text: '상체를 30분 동안 측정했어요. 측정 후반에 턱이 앞으로 나오는지 확인해 보세요.' },
    { key: 'upper', title: '목·좌우 균형', text: '목 점수는 평균 81점이었어요.' },
  ],
  strengths: ['이날 상체를 세 번 측정했어요.'], weaknesses: ['마지막 10분에 목 점수가 내려갔어요.'],
  goals: ['측정 후반에 턱이 앞으로 나오는지 확인하기'],
  caution: '좌우 균형은 관찰 시간이 짧았어요.', model: 'gemma3:4b', adviceSource: 'record', generatedAt: '2026-11-28T05:12:00.000Z',
};

test('daily results show the overview and feedback without generation annotations', () => {
  const out = renderToStaticMarkup(createElement(ReviewCards, { review }));
  for (const title of ['총평', '목·좌우 균형', '잘한 점', '아쉬운 점', '다음 목표']) assert.match(out, new RegExp(`<section aria-label="${title}"`));
  assert.ok(out.indexOf(review.headline) < out.indexOf('상체를 30분 동안 측정했어요.'));
  assert.match(out, /11월 28일 총평/);
  assert.match(out, /<li[^>]*>측정 후반에 턱이 앞으로 나오는지 확인하기<\/li>/);
  assert.match(out, /좌우 균형은 관찰 시간이 짧았어요/);
  assert.doesNotMatch(out, /gemma3:4b|기본 습관 제안|AI 코멘트/);
});
