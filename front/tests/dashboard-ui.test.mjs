import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

async function load(entry) {
  const bundle = await build({ entryPoints: [entry], bundle: true, write: false,
    platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] });
  const compiled = { exports: {} };
  new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
  return compiled.exports.default;
}
const DayDetail = await load('src/features/dashboard/DayDetail.tsx');
const DeviationHours = await load('src/features/statistics/DeviationHours.tsx');
const ScoreRing = await load('src/features/dashboard/ScoreRing.tsx');
const html = (component, props) => renderToStaticMarkup(createElement(component, props));

test('day detail lists only the modes recorded that day', () => {
  const day = { date: '2026-10-04', totalMs: 35 * 60_000, hasRecords: true,
    upper: { turtle: 80, balance: 88, sessions: 1, runMs: 15 * 60_000, deviations: 0 },
    keyboard: { score: null, coverage: null, sessions: 0, runMs: 0, present: false },
    eye: { rate: 16, runMs: 20 * 60_000, breaks: 0, present: true } };
  const out = html(DayDetail, { day });
  assert.match(out, /10월 4일 \(일\)/);
  assert.match(out, /목 80 · 좌우 균형 88/);
  assert.match(out, /1회 · 15분/);
  assert.match(out, /분당 16회/);
  assert.doesNotMatch(out, /키보드/);
  assert.match(out, /총 관찰 35분/);
  // 2026-11-28: the blink rate is a second line of the 상체 row (same camera), not an 안구 row of its own.
  assert.match(out, />상체<\/span>.*>깜빡임 분당 16회</);
  assert.doesNotMatch(out, /안구/);
  const eyeOnly = { ...day, upper: { turtle: null, balance: null, sessions: 0, runMs: 0, deviations: 0 } };
  assert.match(html(DayDetail, { day: eyeOnly }), />상체<\/span><b[^>]*>깜빡임 분당 16회<\/b><span[^>]*>20분</);
});

test('deviation hours show an empty state and name the busiest hour', () => {
  assert.match(html(DeviationHours, { hours: [] }), /상체 기록이 쌓이면 보여요/);
  const bars = html(DeviationHours, { hours: [{ hour: 9, count: 3, strong: true }, { hour: 10, count: 0, strong: false }] });
  assert.match(bars, /기준 이탈이 많은 시간: 9시/);
});

test('day detail can carry a hint line and the ring can show a share in percent', () => {
  const day = { date: '2026-10-04', totalMs: 60_000, hasRecords: true,
    upper: { turtle: 80, balance: 88, sessions: 1, runMs: 60_000, deviations: 0 },
    keyboard: { score: null, coverage: null, sessions: 0, runMs: 0, present: false },
    eye: { rate: null, runMs: 0, breaks: 0, present: false } };
  assert.match(html(DayDetail, { day, hint: '눌러서 학습이력 보기 →' }), /눌러서 학습이력 보기 →/);
  assert.doesNotMatch(html(DayDetail, { day }), /학습이력/);
  const ring = html(ScoreRing, { value: 91.6, strokeClass: 'stroke-mode-upper', label: '제대로 측정', unit: '%' });
  assert.match(ring, /aria-label="제대로 측정 92%"/);
  assert.match(ring, />92%</);
  assert.match(html(ScoreRing, { value: 80, strokeClass: 'stroke-mode-upper', label: '목' }), /aria-label="목 80점"/);
});
