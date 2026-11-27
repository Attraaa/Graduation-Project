import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { entriesByDate } from '../src/features/history/calendar.ts';
import { CURRENT_POLICIES } from '../src/features/history/currentPolicies.ts';
import { eyeMinutes } from '../src/features/history/detail.ts';

async function load(entry) {
  const bundle = await build({ entryPoints: [entry], bundle: true, write: false, loader: { '.css': 'empty' },
    platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] });
  const compiled = { exports: {} };
  new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
  return compiled.exports.default;
}
const StatTile = await load('src/features/statistics/StatTile.tsx');
const KeyboardStatistics = await load('src/features/keyboard/KeyboardStatistics.tsx');
const DayRecords = await load('src/features/history/DayRecords.tsx');
const EmptyDay = await load('src/features/history/EmptyDay.tsx');
const RecordDetail = await load('src/features/history/RecordDetail.tsx');
const KeyboardKeyExploration = await load('src/features/keyboard/KeyboardKeyExploration.tsx');
const html = (component, props) => renderToStaticMarkup(createElement(component, props));

test('key heatmap colours follow the whole score shown: 90 or more green, 70–89 yellow, below 70 red', () => {
  const row = (code, verdict, count) => ({ date: '2026-10-02', code, context: 'plain', finger: 'left:index', verdict,
    reason: { preferred: 'preferred-finger', nearby: 'neighboring-finger', mismatch: 'different-finger' }[verdict], count });
  const counts = [row('KeyA', 'preferred', 8), row('KeyA', 'nearby', 2),   // 94
    row('KeyS', 'preferred', 112), row('KeyS', 'mismatch', 13),             // 89.6 → shows 90
    row('KeyD', 'preferred', 8), row('KeyD', 'mismatch', 2),                // 80
    row('KeyF', 'preferred', 87), row('KeyF', 'mismatch', 38),              // 69.6 → shows 70
    row('KeyG', 'preferred', 1), row('KeyG', 'mismatch', 1)];               // 50
  const out = html(KeyboardKeyExploration, { counts, nearbyCredit: 70, policyVersion: 'ansi-qwerty-touch:2.0.0', selectedKey: 'KeyA', onSelect() {} });
  for (const [key, shown, band] of [['A', 94, 'high'], ['S', 90, 'high'], ['D', 80, 'middle'], ['F', 70, 'middle'], ['G', 50, 'low']]) {
    assert.match(out, new RegExp(`aria-label="${key} 키, ${shown}점[^"]*"[^>]*data-band="${band}"`), key);
  }
  assert.match(out, />90점 이상<\/span>.*>70~90점 미만<\/span>.*>70점 미만<\/span>/);
});

test('number tiles keep missing apart from zero and show comparison chips', () => {
  const missing = html(StatTile, { label: '목 평균 점수', value: '—', unit: '점' });
  assert.match(missing, /—/);
  assert.doesNotMatch(missing, />점</);
  const zero = html(StatTile, { label: '기준에서 벗어남', value: '0', unit: '회', detail: '벗어나 있던 시간 0%' });
  assert.match(zero, />0</);
  assert.match(zero, />회</);
  assert.match(zero, /벗어나 있던 시간 0%/);
  assert.match(html(StatTile, { label: '목 평균 점수', value: '84', unit: '점', chip: { text: '직전 7일보다 +3', tone: 'good' } }),
    /직전 7일보다 \+3/);
  assert.match(html(StatTile, { label: '깜빡임 빈도', value: '14', unit: '회/분', chip: { text: '직전 7일 13회/분', tone: 'neutral' } }),
    /직전 7일 13회\/분/);
});

const keyboardStored = () => ({
  record: { id: 'k1', owner: '7', startedAt: Date.parse('2026-10-02T02:00:00Z'), updatedAt: Date.parse('2026-10-02T02:20:00Z'),
    offsetMinutes: -540, status: 'finished', policyVersion: 'ansi-qwerty-touch:2.0.0',
    recognitionVersion: 'hands-label-distance-v2', nearbyCredit: 70, total: 10 },
  counts: [
    { date: '2026-10-02', code: 'KeyA', context: 'plain', finger: 'left:pinky', verdict: 'preferred', reason: 'preferred-finger', count: 8 },
    { date: '2026-10-02', code: 'KeyA', context: 'plain', finger: 'left:ring', verdict: 'nearby', reason: 'neighboring-finger', count: 2 },
  ] });

test('keyboard tab keeps its own terms, drops the session list and links to history', () => {
  const props = { date: '2026-10-02', days: 7, today: '2026-10-07', detail: () => null, onSelectDate: () => {}, onOpenHistory: () => {} };
  const out = html(KeyboardStatistics, { ...props, data: [keyboardStored()] });
  for (const term of ['훈련 점수', '기본표 일치율', '판정 가능 비율', '사용 일관성', '키별 히트맵', '기본표와 자주 다른 키', '보류·제외 원인']) {
    assert.match(out, new RegExp(term));
  }
  assert.match(out, />94점</);
  assert.doesNotMatch(out, /세션 기록/);
  assert.match(out, /측정 기록은 학습이력에서 보기 →/);
  assert.match(html(KeyboardStatistics, { ...props, data: [] }), /선택한 기간의 키보드 집계가 없습니다/);
});

const posture = (over = {}) => ({ id: 's1:turtle', owner: '7', mode: 'turtle',
  startedAt: Date.parse('2026-10-02T01:05:00Z'), updatedAt: Date.parse('2026-10-02T01:23:00Z'), offsetMinutes: -540,
  scorePolicyVersion: CURRENT_POLICIES.turtle, habitPolicyVersion: CURRENT_POLICIES.habit,
  longestContinuousMs: 0, status: 'finished',
  runMs: 18 * 60_000, validMs: 18 * 60_000, scoreTimeSum: 18 * 60_000 * 70, deviationMs: 0, deviationEpisodeCount: 1, ...over });

test('record rows leave scores and record status to the detail panel', () => {
  const old = posture({ id: 'old:turtle', scorePolicyVersion: 'reference-similarity-turtle-v1', status: 'interrupted',
    startedAt: Date.parse('2026-10-02T00:00:00Z'), updatedAt: Date.parse('2026-10-02T00:05:00Z'),
    runMs: 5 * 60_000, validMs: 5 * 60_000, scoreTimeSum: 5 * 60_000 * 60 });
  const balance = posture({ id: 's1:balance', mode: 'balance', scorePolicyVersion: CURRENT_POLICIES.balance, scoreTimeSum: 18 * 60_000 * 86 });
  const entries = entriesByDate([posture(), balance, old], [], ['2026-10-02']).get('2026-10-02');
  const out = html(DayRecords, { date: '2026-10-02', entries, selectedKey: 'upper:s1', onSelect: () => {} });
  assert.match(out, /10월 2일 \(금\) 기록/);
  assert.match(out, /2회</);
  assert.match(out, /상체<\/b><span[^>]*>10:05 – 10:23</);
  assert.doesNotMatch(out, /목 70|좌우 균형 86|\(18분\)|중단됨|이전 기준/);
  const detail = html(RecordDetail, { entry: entries.find(entry => entry.interrupted), query: {} });
  assert.match(detail, /중단됨 · 이전 기준/);
});

test('record detail: every record type shows a few whole numbers without boxes, then one picture', () => {
  const eyeRecord = { id: 'e1', owner: '7', mode: 'eye', startedAt: Date.parse('2026-10-02T04:00:00Z'), updatedAt: Date.parse('2026-10-02T04:10:00Z'),
    offsetMinutes: -540, policyVersion: CURRENT_POLICIES.eye, status: 'finished',
    runMs: 10 * 60_000, validMs: 9 * 60_000, blinks: 125, breaks: 1, nearReminders: 3, openReminders: 2 };
  const entries = entriesByDate([posture(), posture({ id: 's1:balance', mode: 'balance', scorePolicyVersion: CURRENT_POLICIES.balance,
    scoreTimeSum: 18 * 60_000 * 86 }), eyeRecord], [keyboardStored()], ['2026-10-02']).get('2026-10-02');
  const idle = { data: null, loading: false, error: null, retry: () => {} };
  const detail = (mode, data = null) => html(RecordDetail, { entry: entries.find(entry => entry.mode === mode), query: { ...idle, data } });
  const numbers = out => [...out.matchAll(/<p class="truncate[^"]*" title="([^"]+)">[^<]+<\/p><p[^>]*>([^<]+)/g)].map(match => `${match[1]} ${match[2]}`);
  // User request 2026-11-25: values were all in boxes and the eye detail matched nothing else.
  const upper = detail('upper');
  assert.deepEqual(numbers(upper), ['목 70', '좌우 균형 86', '기준에서 벗어남 2', '제대로 측정 100']);
  assert.match(upper, />분별 점수</);
  assert.doesNotMatch(upper, /rounded-xl bg-surface-muted|정상 종료/);
  const eye = detail('eye', { mode: 'eye', detail: { record: eyeRecord, buckets: [] } });
  assert.deepEqual(numbers(eye), ['깜빡임 빈도 14', '깜빡임 125', '유효 관찰 시간 9분', '눈 휴식 완료 1']);
  assert.match(eye, />분별 깜빡임 빈도</);
  assert.doesNotMatch(eye, /가까워짐 안내|깜빡임 안내|분별 안구 관찰|<table/);
  const keyboard = detail('keyboard', { mode: 'keyboard', stored: keyboardStored() });
  assert.deepEqual(numbers(keyboard), ['훈련 점수 94', '판정한 입력 10', '판정 가능 비율 100']);
  assert.match(keyboard, /키별 히트맵/);
  assert.doesNotMatch(keyboard, /키보드 학습 기록|다음에 연습할 키|관찰 품질|점수 계산과 기록 정보|분별 점수/);
});

test('eye detail chart: blink rate per minute, no rate for a minute under 30 s of valid observation', () => {
  const record = { offsetMinutes: -540 };
  const minute = Date.parse('2026-10-02T04:00:00Z');
  const rows = eyeMinutes({ record, buckets: [
    { minute: minute + 60_000, validMs: 20_000, blinks: 4, runMs: 60_000, breaks: 0, nearReminders: 0, openReminders: 0 },
    { minute, validMs: 50_000, blinks: 10, runMs: 60_000, breaks: 0, nearReminders: 0, openReminders: 0 },
  ] });
  assert.deepEqual(rows, [{ minute, time: '13:00', rate: 12 }, { minute: minute + 60_000, time: '13:01', rate: null }]);
});

test('empty days: today offers the two starts and the latest record, past days offer only existing neighbours', () => {
  const none = () => {};
  const today = html(EmptyDay, { date: '2026-10-07', isToday: true, previous: '2026-10-05', next: null, onSelect: none, onStart: none });
  assert.match(today, /오늘은 아직 측정하지 않았어요/);
  for (const name of ['상체', '키보드']) assert.match(today, new RegExp(`${name}</button>`));
  assert.doesNotMatch(today, /안구<\/button>/);
  assert.match(today, /가장 최근 기록: 10월 5일 \(월\) 보기/);
  const past = html(EmptyDay, { date: '2026-10-03', isToday: false, previous: '2026-10-02', next: '2026-10-04', onSelect: none, onStart: none });
  assert.match(past, /이 날은 측정 기록이 없어요/);
  assert.match(past, /← 10월 2일 \(금\) 기록 보기/);
  assert.match(past, /10월 4일 \(일\) 기록 보기 →/);
  const alone = html(EmptyDay, { date: '2026-10-03', isToday: false, previous: null, next: null, onSelect: none, onStart: none });
  assert.doesNotMatch(alone, /기록 보기/);
});
