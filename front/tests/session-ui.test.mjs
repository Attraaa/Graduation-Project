import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const bundle = await build({ stdin: { contents: [
  "export { default as SessionActions } from './src/features/session/SessionActions.tsx';",
  "export { default as MonitoringNotice } from './src/features/session/MonitoringNotice.tsx';",
  "export { default as CameraGuidance } from './src/features/posture/CameraGuidance.tsx';",
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

test('the keyboard notice region contains idle, pause and error information', () => {
  const current = state(false);
  assert.match(render(app.MonitoringNotice, current), /키보드 측정 안내[^]*시작하면 카메라/);
  current.keyboard.controls = { ...current.keyboard.controls, isRunning: true, isPaused: true };
  assert.match(render(app.MonitoringNotice, current), /일시정지 중/);
  current.keyboard.controls.isPaused = false;
  assert.match(render(app.MonitoringNotice, current), /키보드 위치를 찾고/);
  current.keyboard.snapshot = { phase: 'error', message: '분석 연결 실패' };
  assert.match(render(app.MonitoringNotice, current), /role="alert"[^>]*>분석 연결 실패/);
  current.keyboard.controls = { ...current.keyboard.controls, isRunning: false, failed: true };
  assert.match(render(app.MonitoringNotice, current), /role="alert"[^>]*>분석 연결 실패/);
});

test('the upper camera view carries calibration countdown, the three failure reasons, blink calibration and errors', () => {
  const current = state(false);
  const band = () => render(app.CameraGuidance, current);
  const text = () => band().replace(/<[^>]+>/g, '');
  assert.equal(band(), '');
  current.upper.controls = { ...current.upper.controls, failed: true };
  assert.match(band(), /role="alert"[^>]*>[^]*카메라·분석 연결을 확인한 뒤 다시 시작/);
  current.upper.controls = { isRunning: true, isPaused: true };
  assert.equal(band(), '');
  current.upper.controls.isPaused = false;
  assert.match(text(), /카메라와 상체 분석을 준비/);
  const neck = model => { current.upper.snapshot = { ...app.createMonitorSnapshot(), phase: 'calibrating', progress: 0.4, neckModel: { step: 'prep', secondsLeft: 3, failure: null, angleDropDeg: null, ...model } }; };
  neck();
  assert.match(text(), /3편하게 바르게 앉아 화면 가운데를 보세요\. 3초 뒤 기준 자세를 기록해요\./);
  assert.match(text(), /깜빡임 보정/);
  neck({ step: 'collect', secondsLeft: 4 });
  assert.match(text(), /4그대로 유지해 주세요\. 기준 자세를 기록하고 있어요\./);
  assert.match(band(), /width:40%/);
  for (const [failure, reason] of [['too_few_frames', '얼굴과 양쪽 어깨가 화면 안에 보이게 앉아 주세요.'], ['unstable', '5초 동안 움직임이 있었어요. 움직이지 말고 그대로 계세요.'], ['not_upright', '고개를 들어 화면 가운데를 봐 주세요.']]) {
    neck({ step: 'failed', failure, secondsLeft: 2 });
    assert.ok(text().includes(`${reason} 2초 뒤 다시 시작해요.`), failure);
  }
  current.upper.eye = { phase: 'observing', measurement: { ...app.emptyEyeSnapshot(), calibrated: true } };
  current.upper.snapshot = { ...app.createMonitorSnapshot(), phase: 'unavailable' };
  assert.equal(text(), '얼굴과 양쪽 어깨가 화면에 보이도록 정면을 향해 주세요.');
  current.upper.snapshot.phase = 'observing';
  assert.equal(band(), '');
  current.upper.snapshot.phase = 'error';
  assert.match(band(), /role="alert"[^>]*>[^]*카메라·분석 연결을 확인한 뒤 중지하고 다시 시작/);
});
