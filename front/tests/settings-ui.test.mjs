import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// One bundle so the page and the dialog provider share a context.
const bundle = await build({ stdin: { contents: "export { default as Settings } from './src/pages/Settings.tsx'; export { DialogProvider } from './src/components/AppDialog.tsx'; export * from './src/features/settings/parts.tsx'; export { MemoryRouter } from 'react-router-dom';", resolveDir: process.cwd() },
  bundle: true, write: false, logLevel: 'error', platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Settings, DialogProvider, Modal, Segmented, Switch, MemoryRouter } = compiled.exports;
const html = (component, props) => renderToStaticMarkup(createElement(component, props));
const page = stored => {
  globalThis.window = {};
  globalThis.localStorage = { getItem: key => stored[key] ?? null, setItem() {} };
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(DialogProvider, null, createElement(Settings))));
};

test('segmented control names its group and marks only the chosen option', () => {
  const out = html(Segmented, { label: '테마', options: [{ id: 'light', name: '라이트' }, { id: 'dark', name: '다크' }], value: 'dark', onChange() {} });
  assert.match(out, /role="group" aria-label="테마"/);
  assert.match(out, /aria-pressed="false"[^>]*>라이트</);
  assert.match(out, /aria-pressed="true"[^>]*>다크</);
});

test('a settings window is a named modal dialog with a close button', () => {
  const out = html(Modal, { title: '이메일 변경', onClose() {}, children: '내용' });
  assert.match(out, /role="dialog" aria-modal="true" aria-label="이메일 변경"/);
  assert.match(out, /<h2[^>]*>이메일 변경<\/h2><button type="button" aria-label="닫기"/);
  assert.match(out, />내용<\/dialog>/);
});

test('switch exposes its name and state', () => {
  assert.match(html(Switch, { label: '자세 경고 알림', checked: true, onChange() {} }), /role="switch" aria-checked="true" aria-label="자세 경고 알림"/);
  assert.match(html(Switch, { label: '자세 경고 알림', checked: false, onChange() {} }), /aria-checked="false"/);
});

test('settings page shows the eight cards with defaults when nothing is stored', () => {
  const out = page({});
  for (const title of ['계정', '비밀번호 · 이메일', '화면 테마', '알림', '상체 · 자세 기준', '안구 · 깜빡임 기준', '키보드 · 승인 앱 관찰', '데이터 관리']) {
    assert.match(out, new RegExp(`<section aria-label="${title}"`));
  }
  // Passwords are never typed on the page itself; each change opens a window that checks who is asking.
  assert.doesNotMatch(out, /type="password"/);
  assert.match(out, />이메일 변경<\/button><button[^>]*>비밀번호 재설정</);
  // The missing-email notice waits for the server's answer instead of flashing while it loads.
  assert.match(out, />불러오는 중…</);
  assert.doesNotMatch(out, /등록된 이메일이 없어요/);
  assert.match(out, /aria-pressed="true" aria-label="라이트 테마"/);
  assert.match(out, /aria-pressed="false" aria-label="다크 테마"/);
  assert.match(out, /role="switch" aria-checked="true"/);
  assert.match(out, /aria-pressed="true"[^>]*>10분</);
  assert.match(out, /aria-label="알림 소리"[^]*?aria-pressed="true"[^>]*>켜기</);
  assert.match(out, /<button[^>]*disabled=""[^>]*>알림 테스트<\/button>/);
  // No small footnotes under the cards (user request 2026-11-23).
  assert.doesNotMatch(out, /Windows 데스크톱 앱에서 사용할 수 있어요|다음 측정부터 적용|화면을 이동해도 관찰은 계속돼요/);
  assert.match(out, /id="settings-posture-sensitivity" type="range" min="10" max="100" step="10"[^>]*value="50"/);
  assert.match(out, />50%</);
  assert.match(out, /aria-label="깜빡임 민감도"[^]*?aria-pressed="true"[^>]*>보통</);
  // Alerts: "N점 이하 N초 유지 시" per mode in the alert card (2026-11-25), not a score slider in the upper-body card.
  for (const [name, score, seconds] of [['상체', 70, 3], ['키보드', 70, 3]]) {
    assert.match(out, new RegExp(`aria-label="${name} 알림 점수"[^]*?>${score}(<!-- -->)?점<`));
    assert.match(out, new RegExp(`aria-label="${name} 알림 시간"[^]*?>${seconds}(<!-- -->)?초<`));
  }
  assert.match(out, /<section aria-label="알림"[^]*?>상체<[^]*?이하[^]*?유지 시[^]*?>키보드<[^]*?<section aria-label="상체 · 자세 기준"/);
  assert.doesNotMatch(out, /경고 점수 기준/);
  assert.match(out, /id="settings-base-cva" type="range" min="40" max="60" step="1"[^>]*value="50"/);
  assert.match(out, />50°</);
  assert.match(out, /승인 앱 설정은 데스크톱 앱에서 사용할 수 있습니다/);
  assert.match(out, /통계 삭제</);
  assert.doesNotMatch(out, /변경사항 저장/);
});

test('settings page reflects the stored account, theme, alert and sensitivity values', () => {
  const out = page({
    'moti.session': JSON.stringify({ token: 't', user: { id: '7', username: 'moti_user', nickname: '정섭' } }),
    'postureAI.theme': 'dark', 'postureAI.notifications': 'off', 'postureAI.alertFrequency': '30',
    'postureAI.alertStrength': 'strong', 'postureAI.scoreThreshold': '85', 'postureAI.alertSeconds': '10',
    'postureAI.keyboardThreshold': '90', 'postureAI.keyboardAlertSeconds': '30',
    'moti.settings.postureSensitivity': '80', 'moti.settings.eyeSensitivity': 'high', 'moti.settings.baseCva': '52',
  });
  assert.match(out, />52°</);
  assert.match(out, />아이디 moti_user</);
  assert.match(out, />정<\/span>/);
  assert.match(out, /id="settings-nickname"[^>]*value="정섭"/);
  assert.match(out, /aria-pressed="true" aria-label="다크 테마"/);
  assert.match(out, /role="switch" aria-checked="false"/);
  assert.match(out, /aria-pressed="true"[^>]*>30분</);
  assert.match(out, /aria-label="알림 소리"[^]*?aria-pressed="true"[^>]*>켜기</);
  for (const [name, score, seconds] of [['상체', 85, 10], ['키보드', 90, 30]]) {
    assert.match(out, new RegExp(`aria-label="${name} 알림 점수"[^]*?>${score}(<!-- -->)?점<`));
    assert.match(out, new RegExp(`aria-label="${name} 알림 시간"[^]*?>${seconds}(<!-- -->)?초<`));
  }
  assert.match(out, />80%</);
  assert.match(out, /aria-label="깜빡임 민감도"[^]*?aria-pressed="true"[^>]*>높음</);
});

test('the old unused slider value does not become a posture sensitivity', () => {
  const out = page({ 'postureAI.collapseSensitivity': '20' });
  assert.match(out, />50%</);
  assert.doesNotMatch(out, />20%</);
});
