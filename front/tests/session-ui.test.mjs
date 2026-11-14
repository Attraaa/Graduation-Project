import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const bundle = await build({ stdin: { contents: [
  "export { default as SessionActions } from './src/features/session/SessionActions.tsx';",
  "export { default as MonitoringNotice } from './src/features/session/MonitoringNotice.tsx';",
  "export { MonitoringContext } from './src/features/session/monitoringContext.ts';",
  "export { createMonitorSnapshot } from './src/features/posture/monitorTypes.ts';",
  "export { emptyEyeSnapshot } from './src/features/eye/measurement.ts';",
].join('\n'), resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const app = compiled.exports;
const render = (component, state, modeId = 'upper_body') => renderToStaticMarkup(createElement(app.MonitoringContext.Provider, { value: state }, createElement(component, { modeId })));
function state(isRunning, isPaused = false) {
  const controls = { isRunning, isPaused, pause() {}, resume() {}, stop() {} };
  return {
    upper: { controls, start() {}, snapshot: app.createMonitorSnapshot(), eye: { phase: 'calibrating', measurement: app.emptyEyeSnapshot() } },
    keyboard: { controls, start() {}, snapshot: { phase: 'mapping', message: '키보드 위치를 찾고 있습니다.' } },
  };
}

test('both modes keep three distinct action slots and enable only valid actions', () => {
  for (const [modeId, name] of [['upper_body', '상체'], ['keyboard', '키보드']]) {
    for (const [running, paused] of [[false, false], [true, false], [true, true]]) {
      const html = render(app.SessionActions, state(running, paused), modeId);
      const buttons = [...html.matchAll(/<button\b[^>]+>/g)].map(match => match[0]);
      assert.equal(buttons.length, 3);
      assert.ok(buttons[0].includes(`aria-label="${name} 시작"`));
      assert.ok(buttons[1].includes(`aria-label="${name} ${paused ? '재개' : '일시정지'}"`));
      assert.ok(buttons[2].includes(`aria-label="${name} 중지"`));
      assert.deepEqual(buttons.map(button => button.includes('disabled=""')), [running, !running, !running]);
    }
  }
});

test('the same notice region contains idle, pause, calibration and error information', () => {
  const current = state(false);
  assert.match(render(app.MonitoringNotice, current), /시작하면 카메라/);
  current.upper.controls = { ...current.upper.controls, isRunning: true, isPaused: true };
  assert.match(render(app.MonitoringNotice, current), /일시정지 중/);
  current.upper.controls.isPaused = false;
  current.upper.snapshot.phase = 'calibrating';
  const calibration = render(app.MonitoringNotice, current);
  assert.match(calibration, /기준 자세 수집 진행률/);
  assert.match(calibration, /깜빡임 보정/);
  current.upper.snapshot.phase = 'error';
  assert.match(render(app.MonitoringNotice, current), /role="alert"[^>]*>카메라·분석 연결/);
  current.keyboard.controls = { ...current.keyboard.controls, isRunning: true };
  current.keyboard.snapshot = { phase: 'error', message: '분석 연결 실패' };
  assert.match(render(app.MonitoringNotice, current, 'keyboard'), /role="alert"[^>]*>분석 연결 실패/);
  current.keyboard.controls = { ...current.keyboard.controls, isRunning: false, failed: true };
  assert.match(render(app.MonitoringNotice, current, 'keyboard'), /role="alert"[^>]*>분석 연결 실패/);
});
