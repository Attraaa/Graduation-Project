import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMonitorSnapshot } from '../src/features/posture/monitorTypes.ts';
import { emptyEyeSnapshot } from '../src/features/eye/measurement.ts';

const bundle = await build({ entryPoints: ['src/features/posture/PostureMetrics.tsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const render = (snapshot, eye, isRunning = true) => renderToStaticMarkup(createElement(compiled.exports.default, { snapshot, eye, isRunning }));

test('compact upper metrics distinguish measured zero from missing values and retain session averages', () => {
  const snapshot = createMonitorSnapshot();
  snapshot.neck = { ...snapshot.neck, currentScore: 0, averageScore: 0 };
  snapshot.shoulder = { ...snapshot.shoulder, currentScore: 84.6, averageScore: 90.5 };
  const eye = { ...emptyEyeSnapshot(), recentBlinksPerMinute: 0, blinksPerMinute: 12.3 };
  const html = render(snapshot, eye);
  const textContent = html.replace(/<[^>]+>/g, '');
  for (const text of ['목 점수', '어깨 점수', '깜빡임 빈도', '0점', '85점', '세션 평균 91점', '0.0회/분', '세션 평균 12.3회/분']) assert.ok(textContent.includes(text), text);
  assert.doesNotMatch(html, /안구 점수|종합 점수|세션 상태|눈 휴식/);
  const stopped = render(snapshot, eye, false);
  assert.equal((stopped.match(/>—</g) ?? []).length, 3);
  assert.match(stopped, /세션 평균 0점/);
  assert.match(stopped, /세션 평균 12.3회\/분/);
});
test('unavailable samples have no invented score or blink rate', () => {
  const html = render(createMonitorSnapshot(), emptyEyeSnapshot());
  assert.equal((html.match(/>—</g) ?? []).length, 3);
  assert.equal((html.match(/세션 평균 —/g) ?? []).length, 3);
  assert.doesNotMatch(html, /NaN|Infinity/);
});
test('compact metrics keep a visible movement/recovery protection state', () => {
  const snapshot = createMonitorSnapshot();
  snapshot.neck = { ...snapshot.neck, currentScore: 82, protection: 'moving' };
  snapshot.shoulder = { ...snapshot.shoulder, currentScore: 61, protection: 'recovering' };
  const html = render(snapshot, emptyEyeSnapshot());
  for (const text of ['82점', '61점', '움직임 감지', '기준 자세 복귀 확인']) assert.ok(html.replace(/<[^>]+>/g, '').includes(text));
});
