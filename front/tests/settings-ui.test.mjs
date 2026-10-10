import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// One bundle so the page and the dialog provider share a context.
const bundle = await build({ stdin: { contents: "export { default as Settings } from './src/pages/Settings.tsx'; export { DialogProvider } from './src/components/AppDialog.tsx'; export * from './src/features/settings/parts.tsx';", resolveDir: process.cwd() },
  bundle: true, write: false, logLevel: 'error', platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { Settings, DialogProvider, Segmented, Switch } = compiled.exports;
const html = (component, props) => renderToStaticMarkup(createElement(component, props));
const page = stored => {
  globalThis.window = {};
  globalThis.localStorage = { getItem: key => stored[key] ?? null, setItem() {} };
  return renderToStaticMarkup(createElement(DialogProvider, null, createElement(Settings)));
};

test('segmented control names its group and marks only the chosen option', () => {
  const out = html(Segmented, { label: '테마', options: [{ id: 'light', name: '라이트' }, { id: 'dark', name: '다크' }], value: 'dark', onChange() {} });
  assert.match(out, /role="group" aria-label="테마"/);
  assert.match(out, /aria-pressed="false"[^>]*>라이트</);
  assert.match(out, /aria-pressed="true"[^>]*>다크</);
});

test('switch exposes its name and state', () => {
  assert.match(html(Switch, { label: '자세 경고 알림', checked: true, onChange() {} }), /role="switch" aria-checked="true" aria-label="자세 경고 알림"/);
  assert.match(html(Switch, { label: '자세 경고 알림', checked: false, onChange() {} }), /aria-checked="false"/);
});

test('settings page shows the seven cards with defaults when nothing is stored', () => {
  const out = page({});
  for (const title of ['계정', '비밀번호', '화면 테마', '알림', '자세 교정 기준', '데이터 관리', '키보드 · 승인 앱 관찰']) {
    assert.match(out, new RegExp(`<section aria-label="${title}"`));
  }
  assert.match(out, /aria-pressed="true" aria-label="라이트 테마"/);
  assert.match(out, /aria-pressed="false" aria-label="다크 테마"/);
  assert.match(out, /role="switch" aria-checked="true"/);
  assert.match(out, /aria-pressed="true"[^>]*>10분</);
  assert.match(out, /aria-pressed="true"[^>]*>보통</);
  assert.match(out, />70점 이하</);
  assert.match(out, />50%</);
  assert.match(out, /승인 앱 설정은 데스크톱 앱에서 사용할 수 있습니다/);
  assert.match(out, /통계 삭제</);
  assert.doesNotMatch(out, /변경사항 저장/);
});

test('settings page reflects the stored account, theme and alert values', () => {
  const out = page({
    'moti.session': JSON.stringify({ token: 't', user: { id: '7', username: 'moti_user', nickname: '정섭' } }),
    'postureAI.theme': 'dark', 'postureAI.notifications': 'off', 'postureAI.alertFrequency': '30',
    'postureAI.alertStrength': 'strong', 'postureAI.scoreThreshold': '85', 'postureAI.collapseSensitivity': '20',
  });
  assert.match(out, />아이디 moti_user</);
  assert.match(out, />정<\/span>/);
  assert.match(out, /id="settings-nickname"[^>]*value="정섭"/);
  assert.match(out, /aria-pressed="true" aria-label="다크 테마"/);
  assert.match(out, /role="switch" aria-checked="false"/);
  assert.match(out, /aria-pressed="true"[^>]*>30분</);
  assert.match(out, /aria-pressed="true"[^>]*>강함</);
  assert.match(out, />85점 이하</);
  assert.match(out, />20%</);
});
