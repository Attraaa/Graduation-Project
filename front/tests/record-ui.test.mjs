import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { historyView, historyGraph } from '../src/features/records/views.ts';
import { sampleBatch } from './fixtures/record-batch.mjs';

const bundle = await build({ entryPoints: ['src/features/records/StatisticsData.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const row = { date: '2026-09-19', hour: '09', mode: 'turtle', scorePolicyVersion: 'v1', habitPolicyVersion: 'h1', runMs: 1000, validMs: 1000, scoreTimeSum: 0, deviationMs: 0, deviationEpisodeCount: 0, sessionCount: 1, recordIds: ['one'], longestContinuousMs: 1000 };
test('real statistics render 0 distinctly from missing, with coverage and nonmedical labels', () => {
  const render = rows => renderToStaticMarkup(createElement(compiled.exports.default, { rows, previous: [] }));
  const zero = render([row]);
  assert.match(zero, /0.0점/); assert.match(zero, /100.0%/); assert.match(zero, /비교 자료 없음/);
  assert.match(zero, /지속된 기준 이탈/); assert.doesNotMatch(zero, /82점|\+12%|거북목 주의보/);
  assert.match(render([{ ...row, validMs: 0, longestContinuousMs: 0 }]), /자료 없음/);
  assert.match(render([]), /기록이 없습니다/);
});
test('history maps real status, nullable score and actual dated chart points', () => {
  const record = sampleBatch().record;
  assert.equal(historyView(record).score, null);
  const detail = { record, buckets: [{ minute: record.startedAt, runMs: 1000, validMs: 1000, scoreTimeSum: 0 }] };
  assert.equal(historyGraph(detail)[0].score, 0);
  assert.match(historyGraph(detail)[0].time, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});
