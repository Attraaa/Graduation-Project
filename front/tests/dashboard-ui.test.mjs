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
const TodayTimeline = await load('src/features/dashboard/TodayTimeline.tsx');
const DeviationHours = await load('src/features/dashboard/DeviationHours.tsx');
const html = (component, props) => renderToStaticMarkup(createElement(component, props));

test('day detail lists only the modes recorded that day', () => {
  const day = { date: '2026-10-04', totalMs: 35 * 60_000, hasRecords: true,
    upper: { turtle: 80, shoulder: 88, sessions: 1, runMs: 15 * 60_000, deviations: 0 },
    keyboard: { score: null, coverage: null, sessions: 0, runMs: 0, present: false },
    eye: { rate: 16, runMs: 20 * 60_000, breaks: 0, present: true } };
  const out = html(DayDetail, { day });
  assert.match(out, /10월 4일 \(일\)/);
  assert.match(out, /목 80 · 어깨 88/);
  assert.match(out, /1회 · 15분/);
  assert.match(out, /분당 16회/);
  assert.doesNotMatch(out, /키보드/);
  assert.match(out, /총 관찰 35분/);
});

test('timeline and deviation cards show empty states and interrupted sessions', () => {
  assert.match(html(TodayTimeline, { entries: [] }), /오늘 측정한 기록이 없어요/);
  assert.match(html(DeviationHours, { hours: [] }), /상체 기록이 쌓이면 보여요/);
  const entry = { id: 'e1', mode: 'eye', startedAt: Date.parse('2026-10-06T04:05:00Z'), endedAt: Date.parse('2026-10-06T04:45:00Z'),
    offsetMinutes: -540, turtle: null, shoulder: null, score: null, rate: 14, interrupted: true };
  const out = html(TodayTimeline, { entries: [entry] });
  assert.match(out, /안구/);
  assert.match(out, /분당 14회/);
  assert.match(out, /13:05 – 13:45 \(40분\)/);
  assert.match(out, /중단됨/);
  const bars = html(DeviationHours, { hours: [{ hour: 9, count: 3, strong: true }, { hour: 10, count: 0, strong: false }] });
  assert.match(bars, /기준 이탈이 많은 시간: 9시/);
});
