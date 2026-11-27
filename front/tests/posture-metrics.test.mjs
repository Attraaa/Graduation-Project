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
const render = (snapshot, eye, isRunning = true) => renderToStaticMarkup(createElement(compiled.exports.default, { snapshot, eye, isRunning }));
const text = html => html.replace(/<[^>]+>/g, '');

test('two dials and a half gauge show only the current neck score with estimated CVA, balance score and blink rate', () => {
  const snapshot = createMonitorSnapshot();
  snapshot.neck = { ...snapshot.neck, currentScore: 0, averageScore: 40 };
  snapshot.balance = { ...snapshot.balance, currentScore: 84.6, averageScore: 90.5 };
  const eye = { ...emptyEyeSnapshot(), recentBlinksPerMinute: 0, blinksPerMinute: 12.3 };
  const shown = text(render(snapshot, eye));
  // Each dial reads its value (inside the ring) before its name; the blink gauge reads its 0–30 scale first.
  // Neck score 0 = load 150 % → CVA 50 − 40.11 = 9.89°.
  for (const value of ['0점목 점수추정 CVA 10°', '85점좌우 균형', '0.0회/분깜빡임 빈도']) assert.ok(shown.includes(value), value);
  assert.doesNotMatch(shown, /세션 평균|안구 점수|종합 점수|거북목|정상|진단/);
  // Neck score 60 = load 60 % → 50 − 17.25 = 32.75°.
  assert.ok(text(render({ ...snapshot, neck: { ...snapshot.neck, currentScore: 60 } }, eye)).includes('60점목 점수추정 CVA 33°'));
  assert.equal((render(snapshot, eye, false).match(/>—</g) ?? []).length, 4);
});

test('unavailable samples have no invented score, CVA or blink rate', () => {
  const html = render(createMonitorSnapshot(), emptyEyeSnapshot());
  assert.equal((html.match(/>—</g) ?? []).length, 4);
  assert.doesNotMatch(html, /NaN|Infinity/);
});
