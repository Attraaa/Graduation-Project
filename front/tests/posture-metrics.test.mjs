import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMonitorSnapshot } from '../src/features/posture/monitorTypes.ts';
import { turtleScorePolicy } from '../src/features/posture/modes/turtle.ts';

// Compile the real renderer and its imports without requiring a browser or camera.
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/features/posture/PostureMetrics.tsx', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  external: ['react', 'react-dom'],
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(
  compiled, compiled.exports, createRequire(import.meta.url),
);
const PostureMetrics = compiled.exports.default;

function render(evaluation = {}, props = {}) {
  const snapshot = createMonitorSnapshot(turtleScorePolicy);
  snapshot.evaluation = { ...snapshot.evaluation, ...evaluation };
  return renderToStaticMarkup(createElement(PostureMetrics, {
    snapshot, elapsedSeconds: 10, isRunning: true, ...props,
  }));
}

function metric(markup, label) {
  const match = markup.match(new RegExp(`<p[^>]*>${label}</p>\\s*<p[^>]*>([^<]*)</p>\\s*<p[^>]*>([^<]*)</p>`));
  assert.ok(match, `Missing metric: ${label}`);
  return { value: match[1], detail: match[2] };
}

test('measured zero scores render as zero, distinct from unavailable scores', () => {
  const measured = render({ currentScore: 0, averageScore: 0, currentDeviation: 0.3, validMs: 1000 });
  assert.equal(metric(measured, '현재 점수').value, '0점');
  assert.equal(metric(measured, '세션 평균').value, '0점');
  assert.equal(metric(measured, '기준 대비 변화').value, '30.0%');
  const unavailable = render();
  assert.equal(metric(unavailable, '현재 점수').value, '—');
  assert.equal(metric(unavailable, '세션 평균').value, '—');
});

test('an entirely unobserved session has no average and missing time is not labeled rest', () => {
  const markup = render({}, { elapsedSeconds: 60 });
  assert.equal(metric(markup, '현재 점수').value, '—');
  assert.equal(metric(markup, '세션 평균').value, '—');
  assert.equal(metric(markup, '기준 대비 변화').value, '—');
  assert.equal(metric(markup, '유효 관찰 시간').value, '00:00');
  assert.deepEqual(metric(markup, '관측률'), {
    value: '0.0%', detail: '관찰 미확인 01:00 · 휴식 판정 아님',
  });
  assert.equal(metric(markup, '지속된 기준 이탈').value, '0회');
});

test('stopping hides current measurements while preserving completed session statistics', () => {
  const evaluation = {
    currentScore: 86.7, averageScore: 91.6, currentDeviation: 0.125, validMs: 12500,
    continuousMs: 6000, longestContinuousMs: 9000, deviationEpisodeCount: 2, deviationMs: 3000,
  };
  const running = render(evaluation, { elapsedSeconds: 20 });
  assert.equal(metric(running, '현재 점수').value, '87점');
  assert.equal(metric(running, '기준 대비 변화').value, '12.5%');
  assert.equal(metric(running, '연속 관찰').value, '00:06');
  const stopped = render(evaluation, { elapsedSeconds: 20, isRunning: false });
  assert.equal(metric(stopped, '현재 점수').value, '—');
  assert.equal(metric(stopped, '기준 대비 변화').value, '—');
  assert.deepEqual(metric(stopped, '연속 관찰'), {
    value: '00:00', detail: '최장 00:09 · 실제 착석시간 아님',
  });
  assert.equal(metric(stopped, '세션 평균').value, '92점');
  assert.equal(metric(stopped, '유효 관찰 시간').value, '00:12');
  assert.deepEqual(metric(stopped, '지속된 기준 이탈'), { value: '2회', detail: '확정 후 관찰 00:03' });
});

test('coverage is unavailable at zero elapsed time and bounded at one hundred percent', () => {
  const initial = render({}, { elapsedSeconds: 0 });
  assert.equal(metric(initial, '관측률').value, '—');
  assert.doesNotMatch(initial, /NaN|Infinity/);
  assert.deepEqual(metric(render({ validMs: 5000 }, { elapsedSeconds: 20 }), '관측률'), {
    value: '25.0%', detail: '관찰 미확인 00:15 · 휴식 판정 아님',
  });
  // Observation updates can arrive before the next session timer tick.
  assert.deepEqual(metric(render({ validMs: 1200 }, { elapsedSeconds: 1 }), '관측률'), {
    value: '100.0%', detail: '관찰 미확인 00:00 · 휴식 판정 아님',
  });
});

test('an observation gap preserves the measured average without displaying a current score', () => {
  const markup = render({ averageScore: 0, validMs: 2500, longestContinuousMs: 2500 });
  assert.equal(metric(markup, '현재 점수').value, '—');
  assert.equal(metric(markup, '기준 대비 변화').value, '—');
  assert.equal(metric(markup, '세션 평균').value, '0점');
  assert.equal(metric(markup, '유효 관찰 시간').value, '00:02');
  assert.equal(metric(markup, '연속 관찰').value, '00:00');
});

test('renderer explains reference similarity without anatomical diagnosis or misuse claims', () => {
  const markup = render({ currentScore: 100, averageScore: 100, currentDeviation: 0, validMs: 1000 });
  assert.match(markup, /기준 자세 유사도/);
  assert.match(markup, /개인 기준과의 유사도이며 건강·질환·해부학적 정상 여부를 진단하지 않습니다/);
  assert.match(markup, /기준 이탈은 자세가 달라진 구간이며 잘못된 자세나 오사용이라는 뜻이 아닙니다/);
  assert.match(markup, /세션 평균에는 확인한 구간만 남깁니다/);
});
