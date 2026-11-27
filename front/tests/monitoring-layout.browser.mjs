import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'vite';

const executable = process.env.MOTI_TEST_CHROMIUM || [
  join(process.env.ProgramFiles ?? 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
  join(process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome',
].find(existsSync);
assert.ok(executable, 'Set MOTI_TEST_CHROMIUM to a local Chromium, Chrome or Edge executable.');

async function eventually(read, passes, label) {
  let received;
  const deadline = Date.now() + 15_000;
  do {
    try { received = await read(); if (passes(received)) return received; }
    catch (error) { received = String(error); }
    await delay(75);
  } while (Date.now() < deadline);
  assert.fail(`${label}: ${JSON.stringify(received)}`);
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((done, fail) => { ws.onopen = done; ws.onerror = fail; });
  let nextId = 0;
  const pending = new Map();
  ws.onmessage = ({ data }) => {
    const response = JSON.parse(data);
    pending.get(response.id)?.resolve(response);
    if (response.method === 'Runtime.exceptionThrown') {
      const { exception, text } = response.params.exceptionDetails;
      console.error(exception?.description ?? text);
    }
  };
  const send = async (method, params = {}) => {
    const id = ++nextId;
    const timer = AbortSignal.timeout(15000);
    try {
      const response = await new Promise((resolve, reject) => {
        timer.addEventListener('abort', () => reject(new Error(`No DevTools response to ${method}`)), { once: true });
        pending.set(id, { resolve });
        ws.send(JSON.stringify({ id, method, params }));
      });
      if (response.error) throw new Error(response.error.message);
      return response.result;
    } finally { pending.delete(id); }
  };
  return { send, close: () => ws.close() };
}

const server = await createServer({ mode: 'browser', logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: true, watch: null } });
const profileName = 'moti-layout-test-';
const profile = await mkdtemp(join(tmpdir(), profileName));
const artifacts = process.env.MOTI_UI_ARTIFACTS && resolve(process.env.MOTI_UI_ARTIFACTS);
let chrome, devTools;
try {
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  if (artifacts) await mkdir(artifacts, { recursive: true });
  chrome = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const port = await eventually(async () => Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]), Boolean, 'Chromium port');
  const targets = await eventually(async () => (await fetch(`http://127.0.0.1:${port}/json/list`)).json(), pages => pages.some(page => page.type === 'page'), 'Chromium page');
  devTools = await connect(targets.find(page => page.type === 'page').webSocketDebuggerUrl);
  const { send } = devTools;
  await send('Page.enable');
  await send('Runtime.enable');
  const read = async expression => {
    const evaluated = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.exception?.description ?? evaluated.exceptionDetails.text);
    return evaluated.result.value;
  };
  const page = path => send('Page.navigate', { url: base + path });
  const viewport = (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const click = async (selector, text = '') => {
    const find = `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(el => !el.disabled && el.textContent.includes(${JSON.stringify(text)}))`;
    await eventually(() => read(`!!(${find})`), Boolean, `${selector} ${text}`);
    await read(`(${find}).click()`);
  };
  const text = (selector, value) => eventually(() => read(`document.querySelector(${JSON.stringify(selector)})?.textContent`), received => received?.includes(value), value);
  const screen = async (name, clip) => {
    if (!artifacts) return;
    const { data } = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    await writeFile(join(artifacts, `${name}.png`), Buffer.from(data, 'base64'));
  };
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.captionCalls = [];
    window.motiWindow = { setTheme: async (...input) => { window.captionCalls.push(input); } };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: () => new Promise(() => {}) });
    window.motiKeyboard = { start: () => new Promise(() => {}), stop: async () => {}, onHalt: () => () => {}, settings: async () => ({ apps: [] }) };
    const normalFetch = window.fetch;
    const date = new Date().toLocaleDateString('sv-SE');
    localStorage.setItem('moti.session', JSON.stringify({ token: 'local-fixture', user: { id: '7', nickname: 'Moti', username: 'moti' } }));
    const posture = (mode, hour, score) => ({ date, hour: String(hour), mode, scorePolicyVersion: mode + '-fixture', habitPolicyVersion: 'fixture',
      runMs: 60_000, validMs: 60_000, scoreTimeSum: score * 60_000, deviationMs: 0, deviationEpisodeCount: 0, sessionCount: 1, recordIds: ['s1:' + mode], longestContinuousMs: 0 });
    const start = new Date(date + 'T09:15:00').getTime(), record = { ...posture('turtle', 9, 82), id: 's1:turtle', owner: '7',
      startedAt: start, updatedAt: start + 300_000, offsetMinutes: new Date(start).getTimezoneOffset(), status: 'finished' };
    const eyeRow = { date, hour: '9', policyVersion: 'eye-local', sessionCount: 1, runMs: 60_000, validMs: 60_000, blinks: 16, breaks: 0, nearReminders: 0, openReminders: 0 };
    const eyeRecord = { ...eyeRow, id: 'eye-local', owner: '7', mode: 'eye', startedAt: start - 300_000, updatedAt: start, offsetMinutes: record.offsetMinutes, status: 'finished' };
    const keyRecord = { id: 'key-local', owner: '7', startedAt: start + 360_000, updatedAt: start + 480_000, offsetMinutes: record.offsetMinutes, status: 'finished',
      policyVersion: 'ansi-qwerty-touch:2.0.0', recognitionVersion: 'hands-camera-manual-v3', nearbyCredit: 70, total: 33 };
    const keyboard = { record: keyRecord, counts: [{ date, code: 'KeyF', context: 'plain', finger: 'left:index', verdict: 'preferred', reason: 'preferred-finger', count: 33 }] };
    window.fetch = (input, options) => {
      const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname;
      if (!path.startsWith('/api/')) return normalFetch(input, options);
      const routes = { '/api/auth/me': { email: 'moti@example.test' }, '/api/records/generation': { generation: 0 },
        '/api/records/history': { records: [record, eyeRecord], hasMore: false }, '/api/records/keyboard': [keyboard],
        '/api/records/keyboard/key-local': keyboard, '/api/records/posture-statistics': [posture('turtle', 9, 82), posture('balance', 9, 91), posture('turtle', 16, 77)],
        '/api/records/eye-statistics': [eyeRow], '/api/records/posture/s1%3Aturtle': { record, buckets: [0, 1, 2, 3].map(index => ({ ...record, minute: start + 60_000 * index, scoreTimeSum: (78 + 4 * index) * 60_000 })) },
        '/api/records/eye/eye-local': { record: eyeRecord, buckets: [] } };
      return Promise.resolve(Response.json(routes[path] ?? []));
    };
  ` });

  await viewport(1100, 800);
  await page('/#/dashboard');
  await text('h1', '학습');
  const modeButton = (mode, action) => click(`button[aria-label="${mode} ${action}"]`);
  const bounds = () => read(`Array.from(document.querySelectorAll('section[aria-label$="모니터링"]')).map(card => {
    const box = node => { const { left, top, width, height } = node.getBoundingClientRect(); return { left, top, width, height }; };
    return [box(card), ...Array.from(card.children, box)];
  })`);
  async function symmetry(width, height) {
    await viewport(width, height);
    const [upper, keyboard] = await eventually(bounds, lanes => lanes?.length === 2 && lanes.every(lane => lane.length === 5), 'two cards');
    const near = (a, b) => Math.abs(a - b) <= 1;
    assert.ok(near(upper[0].width, keyboard[0].width));
    if (width >= 768) {
      assert.ok(upper.every((row, index) => near(row.top, keyboard[index].top) && near(row.height, keyboard[index].height)),
        `Asymmetric rows at ${width}×${height}: ${JSON.stringify([upper, keyboard])}`);
      assert.ok(keyboard[0].left > upper[0].left);
      const main = await read(`(() => { const page = document.querySelector('main'); return [page.scrollHeight, page.clientHeight]; })()`);
      assert.ok(main[0] <= main[1], `Dashboard scrolls at ${width}×${height}: ${main[0]} > ${main[1]}`);
      assert.ok(upper[3].height >= 112 && upper[4].height >= 136,
        `Camera and chart heights at ${width}×${height}: ${upper[3].height}, ${upper[4].height}`);
    } else {
      assert.ok(near(upper[0].left, keyboard[0].left));
      assert.ok(keyboard[0].top >= upper[0].top + upper[0].height);
    }
    assert.equal(await read('document.documentElement.scrollWidth <= innerWidth'), true);
    const actionsFit = await read(`Array.from(document.querySelectorAll('section[aria-label$="모니터링"] header')).every(header => {
      const { left, right } = header.getBoundingClientRect();
      const buttons = Array.from(header.querySelectorAll('button'), button => button.getBoundingClientRect());
      return buttons.every(button => button.left >= left && button.right <= right && Math.abs(button.top - buttons[0].top) <= 1);
    })`);
    assert.equal(actionsFit, true, `Measurement buttons fit on one line at ${width}×${height}`);
  }
  await symmetry(800, 600);
  await modeButton('상체', '시작');
  await text('section[aria-label="상체 모니터링"] [role="status"]', '모델 준비 중');
  for (const [width, height] of [[800, 600], [784, 592], [768, 600], [950, 600], [1023, 630], [1100, 800], [1440, 600], [390, 700]]) {
    await symmetry(width, height);
  }
  await modeButton('상체', '중지');
  await text('dialog[open]', '상체 측정이 종료되었습니다');
  assert.deepEqual(await read('captionCalls.at(-1)'), ['light', true]);
  await click('dialog[open] button', '닫기');
  assert.deepEqual(await read('captionCalls.at(-1)'), ['light', false]);
  await viewport(800, 600);
  await modeButton('키보드', '시작');
  await text('section[aria-label="키보드 모니터링"] [role="status"]', '분석기 준비 중');
  for (const width of [800, 950, 1024, 1100, 1440]) await symmetry(width, 600);
  await modeButton('상체', '시작'); await symmetry(800, 600);
  await modeButton('상체', '일시정지'); await symmetry(800, 600);
  await modeButton('상체', '중지');
  await text('dialog[open]', '키보드 측정은 계속 진행 중입니다.');
  await click('dialog[open] button', '통계로 이동하기');
  await text('[role="group"][aria-label="기간"] [aria-pressed="true"]', '1일');
  await text('[role="tab"][aria-selected="true"]', '상체');
  await click('nav a', '학습');
  await text('h1', '학습');
  assert.equal(await read(`!!document.querySelector('button[aria-label="키보드 중지"]')`), true);
  console.log('Dashboard layout holds for active, paused and idle combinations across both sides of the breakpoint.');

  await viewport(1100, 800);
  await page('/tests/monitoring-layout.html');
  await modeButton('상체', '시작'); await modeButton('키보드', '시작');
  await eventually(() => read('document.querySelectorAll(".recharts-line-curve").length'), n => n === 3, 'three live plot lines');
  await symmetry(800, 600);
  await screen('07-compact-dashboard');
  await viewport(1100, 800);
  const expectedTicks = ['5분 전', '4분 전', '3분 전', '2분 전', '1분 전', '최근'];
  const labels = await eventually(() => read(`Array.from(document.querySelectorAll('[aria-label$="점수 추이"] svg text')).map(el => el.textContent).filter(label => /분 전|최근|^-/.test(label))`),
    labels => expectedTicks.every(label => labels.includes(label)), 'whole-minute ticks');
  assert.ok(labels.every(label => !label.startsWith('-')));
  const clip = await read(`(() => { const rows = [...document.querySelectorAll('[aria-label$="점수 추이"]')].map(node => node.getBoundingClientRect());
    return { x: Math.floor(rows[0].left) - 12, y: Math.floor(rows[0].top) - 8, width: Math.ceil(rows.at(-1).right - rows[0].left) + 24, height: Math.ceil(rows[0].height) + 14 }; })()`);
  await screen('01-live-axis', clip);
  await modeButton('상체', '중지');
  const completion = await text('dialog[open]', '키보드 측정은 계속 진행 중입니다.');
  for (const value of ['4분 55초', '78', '91', '14.7']) assert.ok(completion.includes(value));
  await screen('02-completion-summary');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const upper = { run: 1, running: true, paused: false, seconds: 295, status: '관찰 중', detail: '목 81점 · 좌우 균형 93점', error: false,
      metrics: [{ label: '목', value: '81', low: false }, { label: '균형', value: '93', low: false }], note: '', blinkRate: 15.2 };
    const keyboard = { run: 1, running: true, paused: false, seconds: 255, status: '관찰 중', detail: '판정한 입력 62회', error: false,
      metrics: [{ label: '키보드', value: '86', low: false }], note: '판정 62회' };
    let update = () => {}, view;
    window.setOverlay = (active, dark = false, guidance = false) => {
      view = { connected: true, snapshot: { owner: 'layout', sequence: 1, theme: dark ? 'dark' : 'light', savingFailed: guidance,
        upper_body: { ...upper, running: active.includes('upper_body') },
        keyboard: { ...keyboard, running: active.includes('keyboard'), ...(guidance ? { status: '키보드 위치 인식', metrics: [], note: '',
          detail: '손을 키보드에서 떼고 카메라에 전체 키보드가 보이도록 맞춰 주세요.' } : {}) } } };
      update(view);
    };
    setOverlay(['upper_body']);
    window.motiOverlay = { state: async () => view, onState: callback => { update = callback; return () => {}; }, ready: async () => {},
      back: async mode => { window.backMode = mode ?? 'previous'; }, command: async ({ mode, action }) => {
        const snapshot = { ...view.snapshot, [mode]: { ...view.snapshot[mode], running: action !== 'stop', paused: action === 'pause', status: '일시정지' } };
        view = { ...view, snapshot }; update(view); return { ok: true };
      } };
    })();
  ` });
  await viewport(414, 136); await page('/overlay.html');
  await text('.overlay-values', '15.2회/분');
  const rows = () => read(`Array.from(document.querySelectorAll('section[aria-label$="오버레이"]')).map(row => row.getAttribute('aria-label'))`);
  assert.deepEqual(await rows(), ['상체 오버레이']);
  assert.equal(await read(`document.querySelector('main').textContent.includes('Moti')`), false);
  await screen('03-overlay-upper');
  await read(`setOverlay(['keyboard'])`);
  await eventually(rows, list => list[0] === '키보드 오버레이', 'keyboard-only overlay');
  await screen('04-overlay-keyboard');
  await viewport(414, 224); await read(`setOverlay(['upper_body','keyboard'], true, true)`);
  await text('.overlay-keyboard .overlay-detail', '전체 키보드가');
  assert.deepEqual(await rows(), ['상체 오버레이', '키보드 오버레이']);
  assert.equal(await read(`document.querySelectorAll('.overlay-back').length`), 1);
  const clipped = await read(`Array.from(document.querySelectorAll('.overlay-row-header, .overlay-row-body, .overlay-detail, .overlay-score, .overlay-chip, .overlay-notice, .overlay-control')).filter(el => {
    const box = el.getBoundingClientRect();
    return box.x < 0 || box.y < 0 || box.right > innerWidth || box.bottom > innerHeight || el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
  }).map(el => el.className)`);
  assert.deepEqual(clipped, []);
  await screen('05-overlay-both');
  await modeButton('상체', '일시정지'); await modeButton('상체', '재개');
  await modeButton('상체', '중지'); await viewport(414, 136);
  await text('dialog[open]', '키보드 측정은 계속 진행 중입니다.');
  assert.equal(await read(`(() => { const d = document.querySelector('dialog'); return d.scrollHeight <= d.clientHeight; })()`), true);
  await click('dialog[open] button', '닫기');
  assert.deepEqual(await rows(), ['키보드 오버레이']);
  await modeButton('키보드', '중지'); await click('dialog[open] button', '통계로 이동하기');
  assert.equal(await read('backMode'), 'keyboard');
  await click('dialog[open] button', '닫기');
  await click('.overlay-back', '돌아가기'); assert.equal(await read('backMode'), 'previous');
  assert.deepEqual(await rows(), []);
  console.log('Overlay verified in light and dark with one, both and no active modes, blink rate, wrapping and stop controls.');

  await viewport(1100, 800); await page('/#/statistics');
  await text('h1', '통계');
  await text('[role="group"][aria-label="기간"] [aria-pressed="true"]', '1일');
  await text('section[aria-label="시간대별 평균 점수"]', '시간대별 평균 점수');
  await eventually(() => read(`document.querySelectorAll('section[aria-label="시간대별 평균 점수"] .recharts-line-curve').length`), n => n > 0, 'hourly line');
  assert.equal(await read(`document.querySelector('main').textContent.includes('AI 기능 예정')`), false);
  assert.equal(await read(`!!document.querySelector('section[aria-label="날짜별 점수"]')`), false);
  await screen('06-daily-statistics');
  await click('[role="tab"]', '안구');
  await text('section[aria-label="시간대별 깜빡임 빈도"]', '시간대별 깜빡임 빈도');
  await eventually(() => read(`document.querySelectorAll('section[aria-label="시간대별 깜빡임 빈도"] .recharts-line-dot').length`), n => n > 0, 'a measured blink point');
  await click('[role="tab"]', '키보드');
  await text('section[aria-label="연습 변화"]', '세션별 연습 변화');
  await text('section[aria-label="연습 변화"] svg', '09:21');
  await eventually(() => read(`document.querySelectorAll('section[aria-label="연습 변화"] .recharts-line-dot').length`), n => n > 0, 'a measured keyboard point');
  assert.equal(await read(`document.querySelectorAll('main .recharts-bar-rectangle').length`), 0);
  await click('[role="group"][aria-label="기간"] button', '7일');
  await text('[role="group"][aria-label="기간"] [aria-pressed="true"]', '7일');
  await click('[role="tab"]', '상체');
  await text('section[aria-label="날짜별 점수"]', '날짜별 점수');
  await click('[role="group"][aria-label="기간"] button', '30일');
  await text('[role="group"][aria-label="기간"] [aria-pressed="true"]', '30일');
  await click('nav a', '학습이력');
  await text('h1', '학습이력');
  await click('section[aria-label$="기록"] ol button', '상체');
  await text('section[aria-label="기록 상세"]', '분별 점수');
  const history = await read(`(() => {
    const list = document.querySelector('section[aria-label$="기록"]:has(ol)');
    return [list.innerText, document.querySelector('section[aria-label="기록 상세"]').innerText,
      list.clientWidth, document.querySelector('section[aria-label="기록 상세"]').clientWidth, document.querySelector('main header').innerText];
  })()`);
  assert.doesNotMatch(history[0], /목 |좌우 균형|\(\d+분\)/);
  assert.doesNotMatch(history[1], /정상\s*종료/);
  assert.ok(history[3] > history[2] * 2);
  assert.doesNotMatch(history[4], /7일 통계/);
  await click('section[aria-label$="기록"] ol button', '안구');
  await text('section[aria-label="기록 상세"]', '분별 깜빡임 빈도');
  await click('nav a', '설정');
  await text('h1', '설정');
  const alertSettings = await text('section[aria-label="알림"]', '알림 켜기');
  assert.doesNotMatch(alertSettings, /반복 알림|알림 테스트|다른 앱 사용 중|Windows 알림/);
  assert.equal(await read(`!!document.querySelector('section[aria-label="상체 측정 기준"]')`), false);
  await click('section[aria-label="알림"] [role="switch"]');
  assert.equal(await read(`localStorage.getItem('postureAI.notifications')`), 'off');
  console.log('Verified daily and longer statistics, separate eye records, simplified history and the notification switch.');
} finally {
  devTools?.close();
  chrome?.kill();
  await server.close();
  const profilePath = await realpath(profile);
  if (dirname(profilePath) === await realpath(tmpdir()) && basename(profilePath).startsWith(profileName)) {
    await rm(profilePath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
  }
}
