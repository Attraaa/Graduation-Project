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
  "export { default as Login } from './src/pages/Login.tsx';",
  "export { DialogProvider } from './src/components/AppDialog.tsx';",
  "export { MemoryRouter } from 'react-router-dom';",
  "export { findId, requestPasswordReset, verifyResetCode, resetPassword, requestEmailCode, changeEmail, readAccountEmail, loginUser, updateCurrentUser, registerUser, clearStatistics } from './src/utils/authStore.ts';",
  "export { initializeDesktopSession, readSession, clearSession } from './src/utils/apiClient.ts';",
].join('\n'), resolveDir: process.cwd() },
  bundle: true, write: false, logLevel: 'error', platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'],
  loader: { '.svg': 'dataurl' } });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const app = compiled.exports;
const SESSION = JSON.stringify({ token: 't', user: { id: '7', username: 'member', nickname: '회원' } });

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  globalThis.window = new EventTarget();
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  return globalThis.localStorage;
}
const page = component => {
  storage();
  return renderToStaticMarkup(createElement(app.MemoryRouter, null, createElement(app.DialogProvider, null, createElement(component))));
};

test('the desktop renderer migrates old sessions and sends subsequent requests without a Bearer token', async () => {
  const previous = JSON.parse(SESSION);
  const store = storage({ 'moti.session': SESSION });
  const session = { revision: 'native-session', user: previous.user };
  const next = { revision: 'another-native-session', user: { ...previous.user, nickname: '새 이름' } };
  const requests = [];
  window.motiApi = {
    initialize: async legacy => { assert.deepEqual(legacy, previous); return session; },
    request: async call => {
      requests.push(call);
      return { status: 200, data: call.path === '/api/auth/login' ? next : { email: null } };
    },
    logout: async revision => { assert.equal(revision, next.revision); },
  };
  await app.initializeDesktopSession();
  assert.equal(store.getItem('moti.session'), null);
  assert.deepEqual(app.readSession(), session);
  assert.equal(await app.readAccountEmail(), null);
  assert.equal((await app.loginUser('member', 'password')).ok, true);
  assert.deepEqual(app.readSession(), next);
  assert.ok(requests.every(call => call.revision === session.revision && !('token' in call) && !('headers' in call)));
  assert.equal(store.getItem('moti.session'), null);
  await app.clearSession();
  assert.equal(app.readSession(), null);
});
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
  assert.match(out, /<label[^>]*><span>이메일<\/span><input type="email"[^>]*required/);
  assert.match(out, />아이디 찾기<\/button>/);
  assert.doesNotMatch(out, /지원하지 않습니다/);
});

test('the login screen offers finding the ID and resetting the password', () => {
  const out = page(app.Login);
  assert.match(out, /href="\/find-id"[^>]*>아이디 찾기<\/a>/);
  assert.match(out, /href="\/find-password"[^>]*>비밀번호 재설정<\/a>/);
  assert.match(out, /href="\/register"[^>]*>회원가입<\/a>/);
  assert.doesNotMatch(out, /비밀번호 찾기/);
});

test('resetting a password asks for the ID and email first; the code and new-password steps come later', () => {
  const out = page(app.FindPassword);
  assert.match(out, /<h1[^>]*>비밀번호 재설정<\/h1>/);
  assert.match(out, /<label[^>]*><span>아이디<\/span><input type="text"[^>]*required/);
  assert.match(out, /<label[^>]*><span>이메일<\/span><input type="email"[^>]*required/);
  assert.match(out, />인증 코드 받기<\/button>/);
  assert.doesNotMatch(out, /인증 코드 6자리|새 비밀번호|type="password"/);
});

test('registration asks for the email used to find the account and a code mailed to it', () => {
  const out = page(app.Register);
  assert.match(out, /<label for="register-email"[^>]*>이메일<\/label>/);
  assert.match(out, /<input type="email" id="register-email"[^>]*required=""[^>]*name="email"/);
  assert.match(out, /<button type="button"[^>]*>인증 코드 받기<\/button>/);
  // The code field appears once a code was sent.
  assert.doesNotMatch(out, /인증 코드 6자리/);
});

test('late profile success and expiry of account A cannot overwrite account B', async t => {
  const sessionA = { ...JSON.parse(SESSION), revision: 'a' };
  const sessionB = { token: 'b', revision: 'b', user: { id: '8', username: 'other', nickname: '다른 계정' } };
  const store = storage({ 'moti.session': JSON.stringify(sessionA) });
  const replies = [], originalFetch = globalThis.fetch;
  globalThis.fetch = (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer t');
    const gate = Promise.withResolvers(); replies.push(gate);
    return gate.promise;
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const updated = app.updateCurrentUser('이전 계정 이름');
  const expired = app.readAccountEmail();
  store.setItem('moti.session', JSON.stringify(sessionB));
  replies[0].resolve(Response.json({ message: '저장되었습니다' }));
  replies[1].resolve(Response.json({ message: 'old session' }, { status: 401 }));
  assert.equal((await updated).ok, false);
  await assert.rejects(expired, /로그인 상태가 바뀌었어요/);
  await assert.rejects(app.clearStatistics(sessionA), /확인창을 연 계정에서/);
  assert.equal(replies.length, 2);
  assert.deepEqual(JSON.parse(store.getItem('moti.session')), sessionB);
});

test('recovery requests send trimmed input and show the server answer', async t => {
  storage();
  const calls = server(t, 200, { message: '보냈습니다.' });
  const sent = { ok: true, message: '보냈습니다.' };
  assert.deepEqual(await app.findId(' a@example.com '), sent);
  assert.deepEqual(await app.requestPasswordReset(' member ', ' a@example.com '), sent);
  assert.deepEqual(await app.verifyResetCode(' member ', ' 123456 '), sent);
  assert.deepEqual(await app.resetPassword(' member ', ' 123456 ', ' new password '), sent);
  assert.deepEqual(await app.requestEmailCode(' a@example.com '), sent);
  assert.deepEqual(calls.map(({ url, method, body }) => [url, method, body]), [
    ['/api/auth/find-id', 'POST', { email: 'a@example.com' }],
    ['/api/auth/password-reset', 'POST', { username: 'member', email: 'a@example.com' }],
    ['/api/auth/password-reset/verify', 'POST', { username: 'member', code: '123456' }],
    ['/api/auth/password-reset/confirm', 'POST', { username: 'member', code: '123456', newPassword: ' new password ' }],
    ['/api/auth/email-verification', 'POST', { email: 'a@example.com' }],
  ]);
});

test('a server without mail settings shows its message instead of success', async t => {
  storage();
  server(t, 503, { message: '메일 발송이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.' });
  assert.deepEqual(await app.findId('a@example.com'), { ok: false, message: '메일 발송이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.' });
});

test('registration sends the emailed code and preserves cancellation of an abandoned submission', async t => {
  storage();
  const user = { username: 'member', nickname: '회원', email: 'a@example.com', code: '123456', password: 'password' };
  const controller = new AbortController();
  const originalFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url, body: JSON.parse(init.body), signal: init.signal };
    controller.abort();
    return new Response(JSON.stringify({ message: '가입되었습니다.' }));
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  assert.equal((await app.registerUser(user, controller.signal)).ok, false);
  assert.deepEqual({ url: sent.url, body: sent.body }, { url: '/api/auth/register', body: user });
  assert.equal(sent.signal.aborted, true);
  assert.equal(localStorage.getItem('moti.session'), null);
});

test('a wrong current password for the email keeps the login', async t => {
  const stored = storage({ 'moti.session': SESSION });
  const calls = server(t, 400, { message: '현재 비밀번호를 확인해 주세요.' });
  assert.deepEqual(await app.changeEmail(' New@Example.com ', ' 123456 ', 'wrong'), { ok: false, message: '현재 비밀번호를 확인해 주세요.' });
  assert.deepEqual(calls.map(({ url, method, body, authorization }) => [url, method, body, authorization]),
    [['/api/auth/me/email', 'PUT', { email: 'New@Example.com', code: '123456', currentPassword: 'wrong' }, 'Bearer t']]);
  assert.equal(stored.getItem('moti.session'), SESSION);
});

test('the registered email comes from the account and an empty one means none', async t => {
  storage({ 'moti.session': SESSION });
  server(t, 200, { id: 7, username: 'member', nickname: '회원', email: null });
  assert.equal(await app.readAccountEmail(), null);
});

test('an abandoned login response cannot write a session even if fetch returns after cancellation', async t => {
  const stored = storage();
  const controller = new AbortController();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    controller.abort();
    return new Response(JSON.stringify({ token: 'late', user: { id: 7, username: 'member', nickname: '늦은 응답' } }));
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  assert.equal((await app.loginUser('member', 'password', controller.signal)).ok, false);
  assert.equal(stored.getItem('moti.session'), null);
});

test('an abandoned nickname response cannot resurrect a logged-out session', async t => {
  const stored = storage({ 'moti.session': SESSION });
  const controller = new AbortController();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    stored.removeItem('moti.session');
    controller.abort();
    return new Response(JSON.stringify({ message: '변경 완료' }));
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  assert.equal((await app.updateCurrentUser('늦은 응답', controller.signal)).ok, false);
  assert.equal(stored.getItem('moti.session'), null);
});
