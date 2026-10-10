import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { entriesByDate } from '../src/features/history/calendar.ts';
import { CURRENT_POLICIES } from '../src/features/history/currentPolicies.ts';

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
const html = (component, props) => renderToStaticMarkup(createElement(component, props));

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
  assert.match(out, /94\.0점/);
  assert.doesNotMatch(out, /세션 기록/);
  assert.match(out, /측정 기록은 학습이력에서 보기 →/);
  assert.match(html(KeyboardStatistics, { ...props, data: [] }), /선택한 기간의 키보드 집계가 없습니다/);
});

const posture = (over = {}) => ({ id: 's1:turtle', owner: '7', mode: 'turtle',
  startedAt: Date.parse('2026-10-02T01:05:00Z'), updatedAt: Date.parse('2026-10-02T01:23:00Z'), offsetMinutes: -540,
  scorePolicyVersion: CURRENT_POLICIES.turtle, habitPolicyVersion: CURRENT_POLICIES.habit,
  longestContinuousMs: 0, status: 'finished',
  runMs: 18 * 60_000, validMs: 18 * 60_000, scoreTimeSum: 18 * 60_000 * 70, deviationMs: 0, deviationEpisodeCount: 1, ...over });

test('record rows show the upper line, local times, and the interrupted and legacy tags', () => {
  const old = posture({ id: 'old:turtle', scorePolicyVersion: 'reference-similarity-turtle-v1', status: 'interrupted',
    startedAt: Date.parse('2026-10-02T00:00:00Z'), updatedAt: Date.parse('2026-10-02T00:05:00Z'),
    runMs: 5 * 60_000, validMs: 5 * 60_000, scoreTimeSum: 5 * 60_000 * 60 });
  const shoulder = posture({ id: 's1:shoulder', mode: 'shoulder', scorePolicyVersion: CURRENT_POLICIES.shoulder, scoreTimeSum: 18 * 60_000 * 86 });
  const entries = entriesByDate([posture(), shoulder, old], [], ['2026-10-02']).get('2026-10-02');
  const out = html(DayRecords, { date: '2026-10-02', entries, selectedKey: 'upper:s1', onSelect: () => {} });
  assert.match(out, /10월 2일 \(금\) 기록/);
  assert.match(out, /2회 · 23분/);
  assert.match(out, /상체<\/b> · 목 70 · 어깨 86/);
  assert.match(out, /10:05 – 10:23 \(18분\)/);
  assert.match(out, />중단됨</);
  assert.match(out, />이전 기준</);
  assert.match(out, /지금과 다른 점수 기준으로 측정한 기록이에요/);
  const current = html(DayRecords, { date: '2026-10-02', entries: entries.filter(entry => !entry.legacy), selectedKey: null, onSelect: () => {} });
  assert.doesNotMatch(current, /이전 기준/);
});

test('empty days: today offers the three starts and the latest record, past days offer only existing neighbours', () => {
  const none = () => {};
  const today = html(EmptyDay, { date: '2026-10-07', isToday: true, previous: '2026-10-05', next: null, onSelect: none, onStart: none });
  assert.match(today, /오늘은 아직 측정하지 않았어요/);
  for (const name of ['상체', '키보드', '안구']) assert.match(today, new RegExp(`${name}</button>`));
  assert.match(today, /가장 최근 기록: 10월 5일 \(월\) 보기/);
  const past = html(EmptyDay, { date: '2026-10-03', isToday: false, previous: '2026-10-02', next: '2026-10-04', onSelect: none, onStart: none });
  assert.match(past, /이 날은 측정 기록이 없어요/);
  assert.match(past, /← 10월 2일 \(금\) 기록 보기/);
  assert.match(past, /10월 4일 \(일\) 기록 보기 →/);
  const alone = html(EmptyDay, { date: '2026-10-03', isToday: false, previous: null, next: null, onSelect: none, onStart: none });
  assert.doesNotMatch(alone, /기록 보기/);
});
