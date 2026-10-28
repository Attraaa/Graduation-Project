import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// One bundle so the pages, the router and the dialog provider share their contexts.
const bundle = await build({ stdin: { contents: [
  "export { default as FindId } from './src/pages/FindId.tsx';",
  "export { default as FindPassword } from './src/pages/FindPassword.tsx';",
  "export { default as Register } from './src/pages/Register.tsx';",
  "export { DialogProvider } from './src/components/AppDialog.tsx';",
  "export { MemoryRouter } from 'react-router-dom';",
  "export { findId, requestPasswordReset, verifyResetCode, resetPassword, changeEmail, readAccountEmail } from './src/utils/authStore.ts';",
].join('\n'), resolveDir: process.cwd() },
  bundle: true, write: false, logLevel: 'error', platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const app = compiled.exports;
const SESSION = JSON.stringify({ token: 't', user: { id: '7', username: 'member', nickname: '회원' } });

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  globalThis.window = {};
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  return globalThis.localStorage;
}
const page = component => {
  storage();
  return renderToStaticMarkup(createElement(app.MemoryRouter, null, createElement(app.DialogProvider, null, createElement(component))));
};
/** Answers every request with the given status and body, and records what was sent. */
function server(t, status, body) {
  const calls = [], originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body), authorization: init.headers?.Authorization });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  return calls;
}

test('finding an ID asks for the registered email', () => {
  const out = page(app.FindId);
  assert.match(out, /<input type="email" placeholder="이메일"[^>]*required/);
  assert.match(out, />아이디 찾기<\/button>/);
  assert.doesNotMatch(out, /지원하지 않습니다/);
});

test('finding a password asks for the ID and email first; the code and new-password steps come later', () => {
  const out = page(app.FindPassword);
  assert.match(out, /<input type="text" placeholder="아이디"[^>]*required/);
  assert.match(out, /<input type="email" placeholder="이메일"[^>]*required/);
  assert.match(out, />인증 코드 받기<\/button>/);
  assert.doesNotMatch(out, /인증 코드 6자리|새 비밀번호|type="password"/);
});

test('registration asks for the email used to find the account', () => {
  assert.match(page(app.Register), /<input type="email" placeholder="이메일"[^>]*required=""[^>]*name="email"/);
});

test('recovery requests send trimmed input and show the server answer', async t => {
  storage();
  const calls = server(t, 200, { message: '보냈습니다.' });
  const sent = { ok: true, message: '보냈습니다.' };
  assert.deepEqual(await app.findId(' a@example.com '), sent);
  assert.deepEqual(await app.requestPasswordReset(' member ', ' a@example.com '), sent);
  assert.deepEqual(await app.verifyResetCode(' member ', ' 123456 '), sent);
  assert.deepEqual(await app.resetPassword(' member ', ' 123456 ', ' new password '), sent);
  assert.deepEqual(calls.map(({ url, method, body }) => [url, method, body]), [
    ['/api/auth/find-id', 'POST', { email: 'a@example.com' }],
    ['/api/auth/password-reset', 'POST', { username: 'member', email: 'a@example.com' }],
    ['/api/auth/password-reset/verify', 'POST', { username: 'member', code: '123456' }],
    ['/api/auth/password-reset/confirm', 'POST', { username: 'member', code: '123456', newPassword: ' new password ' }],
  ]);
});

test('a server without mail settings shows its message instead of success', async t => {
  storage();
  server(t, 503, { message: '메일 발송이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.' });
  assert.deepEqual(await app.findId('a@example.com'), { ok: false, message: '메일 발송이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.' });
});

test('a wrong current password for the email keeps the login', async t => {
  const stored = storage({ 'moti.session': SESSION });
  const calls = server(t, 400, { message: '현재 비밀번호를 확인해 주세요.' });
  assert.deepEqual(await app.changeEmail(' New@Example.com ', 'wrong'), { ok: false, message: '현재 비밀번호를 확인해 주세요.' });
  assert.deepEqual(calls.map(({ url, method, body, authorization }) => [url, method, body, authorization]),
    [['/api/auth/me/email', 'PUT', { email: 'New@Example.com', currentPassword: 'wrong' }, 'Bearer t']]);
  assert.equal(stored.getItem('moti.session'), SESSION);
});

test('the registered email comes from the account and an empty one means none', async t => {
  storage({ 'moti.session': SESSION });
  server(t, 200, { id: 7, username: 'member', nickname: '회원', email: null });
  assert.equal(await app.readAccountEmail(), null);
});
