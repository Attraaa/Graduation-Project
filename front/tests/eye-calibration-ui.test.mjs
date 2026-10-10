import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyEyeSnapshot } from '../src/features/eye/measurement.ts';
import { eyePolicyVersion } from '../src/features/eye/eyePolicy.ts';
import { CURRENT_POLICIES, isLegacy } from '../src/features/history/currentPolicies.ts';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/features/eye/EyeCalibrationPanel.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react-dom'],
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(
  compiled, compiled.exports, createRequire(import.meta.url),
);
const EyeCalibrationPanel = compiled.exports.default;

function render(measurement = {}, props = {}) {
  return renderToStaticMarkup(createElement(EyeCalibrationPanel, {
    sensitivity: 'normal', locked: false, active: true,
    measurement: { ...emptyEyeSnapshot(), ...measurement },
    onSensitivityChange() {}, ...props,
  }));
}

test('distance collection explains open eyes, obstruction and excluded calibration time', () => {
  const markup = render({ calibrationPhase: 'distance', progress: 0.5 });
  assert.match(markup, /양쪽 눈을 편안하게 뜨고 3초간 정면/);
  assert.match(markup, /머리카락이 눈을 가리지/);
  assert.match(markup, /측정 횟수와 유효 관찰 시간에 포함하지 않습니다/);
  assert.match(markup, /aria-label="안구 거리 기준 수집" value="0.5" max="1"/);
  assert.doesNotMatch(markup, /확인 \d\/3회/);
});

test('eye collection shows guided bilateral instructions and the completed-cycle count', () => {
  const markup = render({ calibrationPhase: 'eyes', calibrationBlinks: 2, progress: 2 / 3 });
  assert.match(markup, /양쪽 눈을 자연스럽게 3번 깜빡여/);
  assert.match(markup, /확인 2\/3회/);
  assert.match(markup, /aria-label="개인 눈 기준 수집"/);
  assert.match(markup, /aria-live="polite"/);
  assert.doesNotMatch(markup, /aria-label="안구 거리 기준 수집"/);
});

test('ready and inactive states do not continue asking for guided calibration', () => {
  for (const markup of [
    render({ calibrated: true, calibrationPhase: 'ready', calibrationBlinks: 3, progress: 1 }),
    render({ calibrationPhase: 'distance' }, { active: false }),
  ]) {
    assert.doesNotMatch(markup, /<progress/);
    assert.doesNotMatch(markup, /aria-live/);
    assert.doesNotMatch(markup, /확인 \d\/3회/);
    assert.match(markup, /윙크는 세지 않습니다/);
  }
});

test('sensitivity choices are accessible, selected and locked during the measurement', () => {
  const unlocked = render();
  assert.match(unlocked, /<select aria-label="깜빡임 민감도"/);
  assert.doesNotMatch(unlocked, /<select[^>]*\sdisabled(?:=|\s|>)/);
  assert.match(unlocked, /<option value="low">낮음<\/option>/);
  assert.match(unlocked, /<option value="normal" selected="">보통<\/option>/);
  assert.match(unlocked, /<option value="high">높음<\/option>/);
  const locked = render({}, { sensitivity: 'high', locked: true });
  assert.match(locked, /<select[^>]*disabled=""/);
  assert.match(locked, /<option value="high" selected="">높음<\/option>/);
  assert.match(locked, /민감도는 측정을 중지한 뒤 바꿀 수 있습니다/);
});

test('history recognizes all three exact preset policy IDs as current and retains the legacy distinction', () => {
  assert.equal(CURRENT_POLICIES.eye, 'eye-habits-v3:normal');
  for (const sensitivity of ['low', 'normal', 'high']) {
    const policyVersion = `eye-habits-v3:${sensitivity}`;
    assert.equal(eyePolicyVersion(sensitivity), policyVersion);
    assert.equal(isLegacy({ mode: 'eye', record: { policyVersion } }), false);
  }
  for (const policyVersion of ['eye-habits-v1', 'eye-habits-v2', 'eye-habits-v3', 'eye-habits-v3:unknown']) {
    assert.equal(isLegacy({ mode: 'eye', record: { policyVersion } }), true);
  }
});
