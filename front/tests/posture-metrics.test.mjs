import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMonitorSnapshot } from '../src/features/posture/monitorTypes.ts';
import { emptyEyeSnapshot } from '../src/features/eye/measurement.ts';

const bundle = await build({ stdin: { contents: "export { default } from './src/features/posture/PostureMetrics.tsx';", resolveDir: process.cwd() }, bundle: true, write: false,
  platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const render = (snapshot, eye, isRunning = true, baseCva = 50) => renderToStaticMarkup(createElement(compiled.exports.default, { snapshot, eye, isRunning, baseCva }));
const text = html => html.replace(/<[^>]+>/g, '');

test('four tiles show only the current neck score, estimated CVA, shoulder score and blink rate', () => {
  const snapshot = createMonitorSnapshot();
  snapshot.neck = { ...snapshot.neck, currentScore: 0, averageScore: 40 };
  snapshot.shoulder = { ...snapshot.shoulder, currentScore: 84.6, averageScore: 90.5 };
  snapshot.neckModel = { ...snapshot.neckModel, angleDropDeg: 6.2 };
  const eye = { ...emptyEyeSnapshot(), recentBlinksPerMinute: 0, blinksPerMinute: 12.3 };
  const shown = text(render(snapshot, eye));
  for (const value of ['목 점수0점', '추정 CVA44°', '어깨 점수85점', '깜빡임 빈도0.0회/분']) assert.ok(shown.includes(value), value);
  assert.doesNotMatch(shown, /세션 평균|안구 점수|종합 점수|거북목|정상|진단/);
  assert.ok(text(render(snapshot, eye, true, 55)).includes('추정 CVA49°'));
  assert.equal((render(snapshot, eye, false).match(/>—</g) ?? []).length, 4);
});

test('unavailable samples have no invented score, CVA or blink rate', () => {
  const html = render(createMonitorSnapshot(), emptyEyeSnapshot());
  assert.equal((html.match(/>—</g) ?? []).length, 4);
  assert.doesNotMatch(html, /NaN|Infinity/);
});
