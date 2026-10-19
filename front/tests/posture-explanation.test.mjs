import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMonitorSnapshot } from '../src/features/posture/monitorTypes.ts';
const bundle = await build({ entryPoints: ['src/features/posture/ScoreExplanation.tsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const render = (snapshot, extra = {}) => renderToStaticMarkup(createElement(compiled.exports.default, { snapshot, isRunning: true, ...extra })).replace(/<[^>]+>/g, '');
function observed() {
  const snapshot = createMonitorSnapshot(); snapshot.phase = 'observing';
  snapshot.delta = { headForward: .2, neckSlump: 0, shoulderTilt: 0, shoulderShrug: 0, torsoForward: 0, yawRatio: 0 };
  snapshot.neck = { ...snapshot.neck, currentScore: 100, rawScore: 81.25, protection: 'grace', staticDeviationMs: 500 };
  return snapshot;
}
test('explanation distinguishes current weighted calculation from grace-protected display score', () => {
  const text = render(observed());
  for (const part of ['81.3점', '100.0점', '20.0%', '35% × 1', '7.0%', '1.5초 남음', '골반은 필요하지 않습니다']) assert.ok(text.includes(part), part);
});
test('paused, stopped and unavailable explanations never show stale measured contributions', () => {
  const snapshot = observed();
  for (const extra of [{ paused: true }, { isRunning: false }]) assert.ok(!render(snapshot, extra).includes('81.3점'));
  snapshot.phase = 'unavailable'; snapshot.reason = 'head-turned';
  const text = render(snapshot);
  assert.match(text, /얼굴이 돌아가/); assert.ok(!text.includes('81.3점'));
});
test('habit thresholds in the explanation follow the running policy instead of current settings', () => {
  const snapshot = observed(); snapshot.neck.habitPolicyVersion = 'weighted-reference-deviation-v6:s70';
  assert.match(render(snapshot), /편차 12.0% 이상 2초 지속, 8.0% 이하 복귀/);
});
