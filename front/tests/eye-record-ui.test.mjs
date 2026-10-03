import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const bundle = await build({ entryPoints: ['src/features/eye/EyeRecordData.tsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const row = { date: '2026-10-02', hour: '10', policyVersion: 'eye-habits-v2', sessionCount: 1,
  runMs: 60000, validMs: 30000, blinks: 0, breaks: 1, nearReminders: 2, openReminders: 1 };
test('eye statistics distinguish missing from zero, group policies and render empty/error-free summaries', () => {
  const render = rows => renderToStaticMarkup(createElement(compiled.exports.EyeStatisticsData, { rows, date: '2026-10-02' }));
  assert.match(render([]), /기록이 없습니다/);
  assert.match(render([row]), new RegExp('0.0회/분'));
  assert.match(render([{ ...row, validMs: 0 }]), /자료 없음/);
  const html = render([row, { ...row, policyVersion: 'future', blinks: 10 }]);
  assert.match(html, new RegExp('0.0회/분')); assert.match(html, new RegExp('20.0회/분'));
  assert.match(html, /날짜별 추이/); assert.match(html, /눈 휴식 완료/);
  assert.doesNotMatch(html, /점수<|AI 피드백/);
});
