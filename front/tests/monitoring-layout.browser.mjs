import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer, searchForWorkspaceRoot } from 'vite';

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

const ortAssets = await realpath('node_modules/onnxruntime-web/dist');
const server = await createServer({ mode: 'browser', logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: true, watch: null,
  fs: { allow: [searchForWorkspaceRoot(process.cwd()), ortAssets] } } });
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
  const findControl = (selector, label) =>
    `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(el => !el.disabled && el.textContent.includes(${JSON.stringify(label)}))`;
  const click = async (selector, text = '') => {
    const find = findControl(selector, text);
    await eventually(() => read(`!!(${find})`), Boolean, `${selector} ${text}`);
    await read(`(${find}).click()`);
  };
  const clickTopEdge = async (selector, label) => {
    const control = findControl(selector, label);
    const point = await eventually(() => read(`(() => {
      const button = ${control};
      if (!button) return null;
      button.scrollIntoView({ block: 'center' });
      const { left, top, width } = button.getBoundingClientRect();
      const x = left + width / 2, y = top + 1;
      return button.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
    })()`), Boolean, `${label} has a clickable top edge`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...point });
    await delay(200);
    const stillHit = await read(`(${control})?.contains(document.elementFromPoint(${point.x}, ${point.y}))`);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...point });
    assert.equal(stillHit, true, `${label} keeps its top edge under the pointer while pressed`);
  };
  const text = (selector, value) => eventually(() => read(`document.querySelector(${JSON.stringify(selector)})?.textContent`), received => received?.includes(value), value);
  const key = async (name, code) => {
    const typed = name === 'Enter' ? '\r' : name === 'Space' ? ' ' : undefined;
    for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type,
      key: name === 'Space' ? ' ' : name, code: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code,
      ...(type === 'keyDown' && typed ? { text: typed, unmodifiedText: typed } : {}) });
  };
  const focusedLabel = () => read(`(() => {
    const element = document.activeElement;
    return element === document.body ? 'BODY' : element?.getAttribute('aria-label') ?? element?.textContent?.trim();
  })()`);
  const activate = async label => {
    const selector = `button[aria-label="${label}"]`;
    await read(`document.querySelector(${JSON.stringify(selector)})?.focus()`);
    assert.equal(await focusedLabel(), label);
    await key('Enter', 13);
  };
  const screen = async (name, clip) => {
    if (!artifacts) return;
    const { data } = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    await writeFile(join(artifacts, `${name}.png`), Buffer.from(data, 'base64'));
  };
  const expectMinuteGap = async label => {
    const selector = `[role="img"][aria-label^="${label}"]`;
    const isBlink = label.includes('깜빡임');
    const series = isBlink ? 'area' : 'line';
    const plot = await eventually(() => read(`(() => {
      const chart = document.querySelector(${JSON.stringify(selector)});
      const curve = chart?.querySelector('.recharts-${series}-curve')?.getAttribute('d');
      const points = Array.from(chart?.querySelectorAll('.recharts-${series}-dot') ?? [],
        dot => [Number(dot.getAttribute('cx')), Number(dot.getAttribute('cy'))]);
      return { curve, points };
    })()`), ({ curve, points }) => curve && points.length === 4, `${label} has four saved points`);
    assert.equal((plot.curve.match(/M/g) ?? []).length, 2, `${label} breaks the line across an unmeasured minute`);
    const [first, second, third, fourth] = plot.points;
    assert.ok(Math.abs(third[0] - second[0] - 2 * (second[0] - first[0])) < 1, `${label} preserves elapsed time`);
    if (isBlink) assert.ok(third[1] > Math.max(first[1], second[1], fourth[1]), 'a saved zero is drawn at the bottom');
  };
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.captionCalls = [];
    window.fixture = { requests: [], failures: [], reviews: {}, reviewBodies: {}, generation: 0, deleteCount: 0 };
    window.motiWindow = { setTheme: async (...input) => { window.captionCalls.push(input); } };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: () => new Promise(() => {}) });
    window.motiKeyboard = { start: () => new Promise(() => {}), stop: async () => {}, onHalt: () => () => {}, settings: async () => ({ apps: [] }) };
    const normalFetch = window.fetch;
    const date = new Date().toLocaleDateString('sv-SE');
    const prior = new Date(date + 'T12:00:00');
    prior.setDate(prior.getDate() - 2);
    window.fixture.reviewDates = { today: date, prior: prior.toLocaleDateString('sv-SE') };
    const login = { token: 'local-fixture', user: { id: '7', nickname: 'Moti', username: 'moti' } };
    if (location.hash === '#/login') localStorage.removeItem('moti.session');
    else localStorage.setItem('moti.session', JSON.stringify(login));
    const camera = 'camera:00000000-0000-4000-8000-000000000001';
    const postureId = mode => camera + ':segment:' + mode;
    const posture = (mode, hour, score) => ({ date, hour: String(hour), mode, scorePolicyVersion: mode + '-fixture', habitPolicyVersion: 'fixture',
      runMs: 60_000, validMs: 60_000, scoreTimeSum: score * 60_000, deviationMs: 0, deviationEpisodeCount: 0, sessionCount: 1, recordIds: [postureId(mode)], longestContinuousMs: 0 });
    const start = new Date(date + 'T09:15:00').getTime();
    const postureRecord = (mode, score) => ({ ...posture(mode, 9, score), id: postureId(mode), owner: '7',
      startedAt: start, updatedAt: start + 300_000, runMs: 300_000, offsetMinutes: new Date(start).getTimezoneOffset(), status: 'finished' });
    const record = postureRecord('turtle', 82), balance = postureRecord('balance', 91);
    const eyeRow = { date, hour: '9', policyVersion: 'eye-local', sessionCount: 1, runMs: 60_000, validMs: 60_000, blinks: 16, breaks: 0, nearReminders: 0, openReminders: 0 };
    const eyeRecord = { ...eyeRow, id: camera + ':eye', owner: '7', mode: 'eye', startedAt: start,
      updatedAt: start + 300_000, runMs: 300_000, offsetMinutes: record.offsetMinutes, status: 'running' };
    const observed = [0, 1, 3, 4];
    const keyRecord = { id: 'key-local', owner: '7', startedAt: start + 360_000, updatedAt: start + 480_000, offsetMinutes: record.offsetMinutes, status: 'finished',
      policyVersion: 'ansi-qwerty-touch:2.0.0', recognitionVersion: 'hands-camera-manual-v3', nearbyCredit: 70, total: 33 };
    const keyboard = { record: keyRecord, counts: [{ date, code: 'KeyF', context: 'plain', finger: 'left:index', verdict: 'preferred', reason: 'preferred-finger', count: 33 }] };
    window.fetch = (input, options) => {
      const { pathname: path, search } = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (!path.startsWith('/api/')) return normalFetch(input, options);
      const method = options?.method ?? 'GET';
      const call = method + ' ' + path;
      window.fixture.requests.push(call);
      if (window.fixture.failures.includes(call)) return Promise.resolve(Response.json({ message: '이 시험의 요청이 실패했습니다.' }, { status: 503 }));
      if (method === 'DELETE' && path === '/api/records') {
        window.fixture.deleteCount++;
        return Promise.resolve(Response.json({ generation: ++window.fixture.generation }));
      }
      if (path === '/api/ai/review') {
        const review = JSON.parse(options.body);
        const key = review.date ?? review.from + ':' + review.to;
        window.fixture.reviewBodies[key] = review;
        return new Promise(resolve => { window.fixture.reviews[key] = resolve; });
      }
      if (path === '/api/hospitals') {
        const data = JSON.parse(options.body);
        const label = data.query ?? '현재 위치';
        if (label === '실패 주소') return Promise.resolve(Response.json({ message: '검색에 실패했어요' }, { status: 503 }));
        return Promise.resolve(Response.json({ center: { label, lat: 37.57, lng: 126.98 }, hospitals: data.department === '안과' ? [] :
          [{ id: '19', name: label + ' 병원', category: '의원', lat: 37.57, lng: 126.98, phone: '', address: label, distance: 80, url: '' }] }));
      }
      const query = new URLSearchParams(search);
      const to = query.get('to');
      const includesToday = !to || to >= date;
      const routes = { '/api/auth/login': login, '/api/auth/me': { email: 'moti@example.test' }, '/api/records/generation': { generation: window.fixture.generation },
        '/api/records/history': { records: window.fixture.deleteCount ? [] : [record, eyeRecord], hasMore: false },
        '/api/records/keyboard': window.fixture.deleteCount ? [] : [keyboard],
        '/api/records/keyboard/key-local': keyboard, '/api/records/posture-statistics': includesToday ? [posture('turtle', 9, 82), posture('balance', 9, 91), posture('turtle', 16, 77)] : [],
        '/api/records/eye-statistics': includesToday ? [eyeRow] : [], ['/api/records/posture/' + encodeURIComponent(record.id)]:
          { record, buckets: observed.map(index => ({ ...posture('turtle', 9, 78 + 4 * index), minute: start + 60_000 * index })) },
        ['/api/records/posture/' + encodeURIComponent(balance.id)]:
          { record: balance, buckets: [{ ...posture('balance', 9, 91), minute: start }] },
        ['/api/records/eye/' + encodeURIComponent(eyeRecord.id)]:
          { record: eyeRecord, buckets: observed.map(index => ({ ...eyeRow, minute: eyeRecord.startedAt + 60_000 * index, blinks: index === 3 ? 0 : 12 + 3 * index })) } };
      if (call === 'GET /api/records/history' && window.fixture.deferHistory) {
        return new Promise(resolve => { window.fixture.finishHistory = status => resolve(Response.json(routes[path], { status })); });
      }
      if (call === 'GET /api/records/history' && window.fixture.historyOffsets) {
        const offset = Number(query.get('offset'));
        window.fixture.historyOffsets.push(offset);
        const page = { records: [record, eyeRecord].slice(offset, offset + 1), hasMore: offset === 0 };
        if (offset === 1) {
          return new Promise(resolve => { window.fixture.finishHistoryPage = status => resolve(Response.json(page, { status })); });
        }
        return Promise.resolve(Response.json(page));
      }
      if (method === 'GET' && path.startsWith('/api/records/eye/') && !(path in routes)) {
        return Promise.resolve(Response.json({ message: '안구 기록을 찾을 수 없습니다.' }, { status: 404 }));
      }
      return Promise.resolve(Response.json(routes[path] ?? []));
    };
  ` });

  await viewport(1100, 800);
  await page('/#/login');
  await text('h1', 'Moti');
  for (const [field, value] of [['username', 'moti'], ['current-password', 'fixture-password']]) {
    await read(`document.querySelector('input[autocomplete="${field}"]').focus()`);
    await send('Input.insertText', { text: value });
  }
  await clickTopEdge('form button[type="submit"]', '시작하기');
  await text('h1', '학습');
  assert.equal(await read(`window.fixture.requests.filter(call => call === 'POST /api/auth/login').length`), 1);
  const picker = '[role="group"][aria-label="표시할 측정"]';
  const modeChoice = mode => `${picker} button[aria-controls="dashboard-${mode === '상체' ? 'upper_body' : 'keyboard'}"]`;
  const selectMode = mode => click(modeChoice(mode));
  const modeButton = async (mode, action) => {
    const button = `button[aria-label="${mode} ${action}"]`;
    const visible = selector => read(`!!document.querySelector(${JSON.stringify(selector)})?.getClientRects().length`);
    if (await visible(picker) && !(await visible(button))) await selectMode(mode);
    await eventually(() => visible(button), Boolean, `${mode} ${action} is visible`);
    await click(button);
  };
  const bounds = () => read(`Array.from(document.querySelectorAll('section[aria-label$="모니터링"]')).filter(card => card.getClientRects().length).map(card => {
    const box = node => { const { left, top, width, height } = node.getBoundingClientRect(); return { left, top, width, height }; };
    return [box(card), ...Array.from(card.children, box)];
  })`);
  async function symmetry(width, height) {
    await viewport(width, height);
    const count = width < 768 ? 1 : 2;
    const [upper, keyboard] = await eventually(bounds, lanes => lanes?.length === count && lanes.every(lane => lane.length === 5), `${count} measurement cards at ${width}×${height}`);
    const main = await read(`(() => { const page = document.querySelector('main'); return [page.scrollHeight, page.clientHeight]; })()`);
    assert.ok(main[0] <= main[1] + 1, `Dashboard scrolls at ${width}×${height}: ${main[0]} > ${main[1]}`);
    const near = (a, b) => Math.abs(a - b) <= 1;
    if (keyboard) {
      assert.ok(near(upper[0].width, keyboard[0].width));
      assert.ok(upper.every((row, index) => near(row.top, keyboard[index].top) && near(row.height, keyboard[index].height)),
        `Asymmetric rows at ${width}×${height}: ${JSON.stringify([upper, keyboard])}`);
      assert.ok(keyboard[0].left > upper[0].left);
      assert.ok(upper[3].height >= 112 && upper[4].height >= 136,
        `Camera and chart heights at ${width}×${height}: ${upper[3].height}, ${upper[4].height}`);
    } else {
      assert.ok(upper[3].height >= 88 && upper[4].height >= 96,
        `Compact camera and chart heights at ${width}×${height}: ${upper[3].height}, ${upper[4].height}`);
      const compact = await read(`(() => {
        const pressed = document.querySelector(${JSON.stringify(`${picker} button[aria-pressed="true"]`)});
        return { card: !!document.getElementById(pressed?.getAttribute('aria-controls'))?.getClientRects().length,
          menu: document.querySelector('nav[aria-label="주 메뉴"]').getBoundingClientRect().top };
      })()`);
      assert.ok(compact.card && upper[0].top + upper[0].height <= compact.menu, `The selected card fits above navigation at ${width}×${height}`);
    }
    assert.equal(await read('document.documentElement.scrollWidth <= innerWidth'), true);
    const actionsFit = await read(`Array.from(document.querySelectorAll('section[aria-label$="모니터링"] header')).filter(header => header.getClientRects().length).every(header => {
      const { left, right } = header.getBoundingClientRect();
      const buttons = Array.from(header.querySelectorAll('button'), button => button.getBoundingClientRect());
      return buttons.every(button => button.left >= left && button.right <= right && Math.abs(button.top - buttons[0].top) <= 1);
    })`);
    assert.equal(actionsFit, true, `Measurement buttons fit on one line at ${width}×${height}`);
  }
  await symmetry(800, 600);
  await symmetry(320, 568);
  await modeButton('상체', '시작');
  await text('section[aria-label="상체 모니터링"] [role="status"]', '모델 준비 중');
  for (const [width, height] of [[800, 600], [784, 592], [768, 600], [950, 600], [1023, 630], [1100, 800], [1440, 600], [390, 700], [320, 568], [640, 448]]) {
    await symmetry(width, height);
  }
  await activate('상체 중지');
  await text('dialog[open]', '상체 측정이 종료되었습니다');
  assert.deepEqual(await read('captionCalls.at(-1)'), ['light', true]);
  assert.equal(await focusedLabel(), '닫기');
  await key('Tab', 9);
  assert.equal(await focusedLabel(), '통계로 이동하기');
  await key('Tab', 9);
  assert.equal(await focusedLabel(), '닫기');
  await key('Escape', 27);
  assert.deepEqual(await read('captionCalls.at(-1)'), ['light', false]);
  assert.equal(await focusedLabel(), '상체 시작', 'keyboard focus returns to the stopped card');
  await modeButton('상체', '시작');
  await activate('상체 중지');
  await text('dialog[open]', '상체 측정이 종료되었습니다');
  await clickTopEdge('dialog[open] button', '통계로 이동하기');
  await text('h1', '통계');
  await click('nav a', '학습');
  await viewport(800, 600);
  await modeButton('키보드', '시작');
  await text('section[aria-label="키보드 모니터링"] [role="status"]', '분석기 준비 중');
  for (const width of [800, 950, 1024, 1100, 1440]) await symmetry(width, 600);
  await modeButton('상체', '시작'); await symmetry(800, 600);
  await symmetry(640, 448);
  await read(`document.querySelector(${JSON.stringify(modeChoice('키보드'))}).focus()`);
  await key('Enter', 13);
  assert.equal(await read(`document.activeElement.getAttribute('aria-pressed')`), 'true');
  await text(modeChoice('상체'), '모델 준비 중');
  await modeButton('키보드', '일시정지');
  await selectMode('상체');
  await text(modeChoice('키보드'), '일시정지');
  await symmetry(320, 568);
  await modeButton('키보드', '재개');
  await text('section[aria-label="키보드 모니터링"] [role="status"]', '분석기 준비 중');
  await symmetry(320, 568);
  await modeButton('상체', '일시정지'); await symmetry(800, 600);
  await activate('상체 중지');
  await text('dialog[open]', '키보드 측정은 계속 진행 중입니다.');
  await key('Tab', 9);
  assert.equal(await focusedLabel(), '통계로 이동하기');
  await key('Enter', 13);
  await text('[role="group"][aria-label="기간"] [aria-pressed="true"]', '1일');
  await text('[role="tab"][aria-selected="true"]', '상체');
  assert.equal(await read(`document.activeElement === document.querySelector('[role="tab"][aria-selected="true"]')`), true);
  await click('nav a', '학습');
  await text('h1', '학습');
  assert.equal(await read(`!!document.querySelector('button[aria-label="키보드 중지"]')`), true);
  await modeButton('상체', '시작');
  await viewport(320, 568);
  await read(`location.hash = '/dashboard?mode=upper_body'`);
  await text(modeChoice('키보드'), '분석기 준비 중');
  await selectMode('상체');
  await read(`location.hash = '/dashboard?mode=keyboard'`);
  await eventually(() => read(`document.querySelector(${JSON.stringify(modeChoice('키보드'))}).getAttribute('aria-pressed')`), value => value === 'true', 'the measurement link selects its compact card');
  await read(`location.hash = '/dashboard?mode=upper_body'`);
  await viewport(1100, 800);
  await activate('키보드 중지');
  await text('dialog[open]', '상체 측정은 계속 진행 중입니다.');
  await viewport(320, 568);
  await key('Enter', 13);
  assert.equal(await focusedLabel(), '키보드 시작', 'the closed dialog returns focus after a resize');
  console.log('The dashboard fits without scrolling in wide and compact windows, and switching cards preserves each measurement.');

  await viewport(1100, 800);
  await page('/tests/monitoring-layout.html');
  await modeButton('상체', '시작'); await modeButton('키보드', '시작');
  await eventually(() => read('document.querySelectorAll(".recharts-line-curve").length'), n => n === 3, 'three live plot lines');
  for (const [width, height] of [[320, 568], [390, 844]]) {
    await symmetry(width, height);
    const card = 'section[aria-label="상체 모니터링"]';
    await text(card, '100');
    await text(card, '추정 CVA');
    await text(card, '15.2');
    await text(card + ' [role="status"]', '관찰 중');
    await eventually(() => read(`(() => {
      const card = document.querySelector('${card}');
      const bounds = card.getBoundingClientRect();
      const status = card.querySelector('[role="status"]');
      const meters = [...card.querySelectorAll('svg[viewBox="0 0 120 120"], svg[viewBox="0 0 132 74"]')];
      const meterFits = meters.map(meter => {
        const box = meter.getBoundingClientRect();
        const sibling = meter.parentElement.querySelector('p');
        return box.left >= bounds.left && box.right <= bounds.right && (!sibling || sibling.scrollWidth <= sibling.clientWidth + 1);
      });
      return { width: innerWidth, card: card.scrollWidth - card.clientWidth, status: status.scrollWidth - status.clientWidth, meters: meterFits };
    })()`), layout => layout.width === width && layout.card <= 1 && layout.status <= 1 && layout.meters.length === 3 && layout.meters.every(Boolean),
    `score dials fit ${width}×${height}`);
  }
  await viewport(320, 568);
  await screen('review-dashboard-320');
  await selectMode('키보드');
  await symmetry(320, 568);
  await eventually(() => read('document.querySelectorAll("#dashboard-keyboard .recharts-line-curve").length'), n => n === 1, 'compact keyboard plot');
  await screen('review-dashboard-keyboard-320');
  await selectMode('상체');
  await symmetry(640, 448);
  await screen('review-dashboard-640');
  await read(`document.documentElement.classList.add('dark-theme')`);
  await symmetry(320, 568);
  await screen('review-dashboard-320-dark');
  await read(`document.documentElement.classList.remove('dark-theme')`);
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

  for (const [phase, status, message] of [
    ['calibrating', '기준 자세 수집', '기준 자세를 기록하고 있어요'],
    ['error', '분석 오류', '카메라·분석 연결을 확인한 뒤'],
  ]) {
    await page(`/tests/monitoring-layout.html?posture=${phase}`);
    await eventually(() => read(`location.search === '?posture=${phase}' && !!document.querySelector('button[aria-label="상체 시작"]')`),
      Boolean, `posture ${phase} fixture is ready`);
    await modeButton('상체', '시작'); await modeButton('키보드', '시작');
    const statusSelector = 'section[aria-label="상체 모니터링"] header [role="status"]';
    await text(statusSelector, status);
    const guide = '[aria-label="상체 측정 안내"]';
    await text(guide, message);
    if (phase === 'calibrating') await text(guide, '깜빡임 보정');
    for (const [width, height] of [[320, 568], [390, 844], [640, 448], [800, 600], [1100, 800]]) {
      await symmetry(width, height);
      assert.ok(await read(`(() => {
        const label = document.querySelector(${JSON.stringify(statusSelector)});
        return label.scrollWidth <= label.clientWidth + 1;
      })()`), `posture ${phase} label fits at ${width}×${height}`);
      const guideOffset = await read(`(() => {
        const band = document.querySelector(${JSON.stringify(guide)});
        return band.getBoundingClientRect().top - band.parentElement.getBoundingClientRect().top;
      })()`);
      assert.ok(guideOffset >= -1, `The ${phase} guidance is fully inside the preview at ${width}×${height}: ${guideOffset}px`);
    }
  }
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
      back: async () => { window.backs = (window.backs ?? 0) + 1; }, command: async ({ mode, action }) => {
        if (action === 'stop') window.stops = [...(window.stops ?? []), mode];
        const snapshot = { ...view.snapshot, [mode]: { ...view.snapshot[mode], running: action !== 'stop', paused: action === 'pause', status: '일시정지' } };
        view = { ...view, snapshot }; update(view); return { ok: true };
      } };
    })();
  ` });
  await viewport(324, 104); await page('/overlay.html');
  await text('.overlay-values', '15.2회/분');
  const rows = () => read(`Array.from(document.querySelectorAll('section[aria-label$="오버레이"]')).map(row => row.getAttribute('aria-label'))`);
  assert.deepEqual(await rows(), ['상체 오버레이']);
  assert.equal(await read(`document.querySelector('main').textContent.includes('Moti')`), false);
  await screen('03-overlay-upper');
  await read(`setOverlay(['keyboard'])`);
  await eventually(rows, list => list[0] === '키보드 오버레이', 'keyboard-only overlay');
  await screen('04-overlay-keyboard');
  await viewport(324, 188); await read(`setOverlay(['upper_body','keyboard'], true, true)`);
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
  // A stop ends in the main window (Electron main closes the overlay there), so no result dialog opens here.
  await activate('상체 중지'); await viewport(324, 104);
  await eventually(rows, list => list.length === 1 && list[0] === '키보드 오버레이', 'upper stopped');
  assert.equal(await read(`!!document.querySelector('dialog')`), false);
  await modeButton('키보드', '중지');
  await eventually(rows, list => list.length === 0, 'keyboard stopped');
  assert.deepEqual(await read('window.stops'), ['upper_body', 'keyboard']);
  assert.equal(await read(`!!document.querySelector('dialog')`), false);
  await click('.overlay-back', '돌아가기'); assert.equal(await read('window.backs'), 1);
  console.log('Overlay verified in light and dark with one, both and no active modes, blink rate, wrapping and stop controls.');

  await viewport(1100, 800); await page('/#/statistics');
  await text('h1', '통계');
  await text('[role="group"][aria-label="기간"] [aria-pressed="true"]', '1일');
  await text('section[aria-label="시간대별 평균 점수"]', '시간대별 평균 점수');
  await eventually(() => read(`document.querySelectorAll('section[aria-label="시간대별 평균 점수"] .recharts-line-curve').length`), n => n > 0, 'hourly line');
  assert.equal(await read(`document.querySelector('main').textContent.includes('AI 기능 예정')`), false);
  assert.equal(await read(`!!document.querySelector('section[aria-label="날짜별 점수"]')`), false);
  await screen('06-daily-statistics');
  assert.deepEqual(await read(`[...document.querySelectorAll('[role="tab"]')].map(tab => tab.textContent)`), ['상체', '키보드']);
  const eyeChart = '#stats-section-eye section[aria-label="시간대별 깜빡임 빈도"]';
  await text(eyeChart, '시간대별 깜빡임 빈도');
  await eventually(() => read(`document.querySelectorAll('${eyeChart} .recharts-line-dot').length`), n => n > 0, 'a measured blink point in the upper-body tab');
  await click('nav[aria-label="상체 통계 바로가기"] button', '눈');
  await text('nav[aria-label="상체 통계 바로가기"] button[aria-current="true"]', '눈');
  await page('/#/statistics?mode=eye');
  await text('[role="tab"][aria-selected="true"]', '상체');
  await text('nav[aria-label="상체 통계 바로가기"] button[aria-current="true"]', '눈');
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
  const historyList = 'section[aria-label$="기록"]:has(ol)';
  await click(historyList + ' ol button', '상체');
  await text('section[aria-label="기록 상세"]', '분별 기록');
  await expectMinuteGap('분별 목·좌우 균형 점수');
  await expectMinuteGap('분별 깜빡임 빈도');
  const history = await read(`(() => {
    const list = document.querySelector('${historyList}');
    return [list.innerText, document.querySelector('section[aria-label="기록 상세"]').innerText,
      list.clientWidth, document.querySelector('section[aria-label="기록 상세"]').clientWidth, document.querySelector('main header').innerText];
  })()`);
  assert.match(history[0], /목 82.*깜빡임 16회\/분/);
  assert.equal(await read(`[...document.querySelectorAll('${historyList} ol button')].filter(button => button.textContent.includes('상체')).length`), 1);
  assert.doesNotMatch(history[1], /정상\s*종료/);
  assert.ok(history[3] > history[2] * 2);
  assert.doesNotMatch(history[4], /7일 통계/);
  await click('nav a', '설정');
  await text('h1', '설정');
  const alertSettings = await text('section[aria-label="알림"]', '알림 켜기');
  assert.doesNotMatch(alertSettings, /반복 알림|알림 테스트|다른 앱 사용 중|Windows 알림/);
  assert.equal(await read(`!!document.querySelector('section[aria-label="상체 측정 기준"]')`), false);
  await click('section[aria-label="알림"] [role="switch"]');
  assert.equal(await read(`localStorage.getItem('postureAI.notifications')`), 'off');

  const noHorizontal = async (width, height) => {
    await viewport(width, height);
    await eventually(() => read(`(() => { const main = document.querySelector('main');
      return { content: main.scrollWidth, viewport: main.clientWidth, doc: document.documentElement.scrollWidth, available: innerWidth }; })()`),
    size => size.content <= size.viewport + 1 && size.doc <= size.available, `horizontal fit at ${width}×${height}`);
  };
  await noHorizontal(320, 568);
  assert.deepEqual(await read(`[...document.querySelectorAll('nav > a')].map(el => el.innerText)`),
    ['학습', '통계', '학습이력', 'AI 총평', '설정']);
  await read(`document.querySelector('nav summary').focus()`);
  assert.equal(await read('document.activeElement.tagName'), 'SUMMARY');
  await key('Space', 32);
  await text('nav details[open]', '로그아웃');
  await read(`document.querySelector('nav details').open = false`);
  await click('nav a', '통계');
  for (const days of [7, 30]) {
    await click('[aria-label="기간"] button', `${days}일`);
    await click('[role="tab"]', '상체');
    await read(`document.getElementById('stats-tab-upper').focus()`);
    for (const [press, code, label] of [['ArrowRight', 39, '키보드'], ['Home', 36, '상체'], ['End', 35, '키보드'], ['ArrowLeft', 37, '상체']]) {
      await key(press, code);
      await text('[role="tab"][aria-selected="true"]', label);
      assert.ok(await read(`(() => {
        const tab = document.activeElement;
        const panel = document.getElementById(tab.getAttribute('aria-controls'));
        return panel && !panel.hidden && panel.getAttribute('aria-labelledby') === tab.id;
      })()`));
    }
  }
  await noHorizontal(320, 568);
  await screen('review-statistics-320');
  const activePanel = await read(`document.querySelector('[role="tab"][aria-selected="true"]').getAttribute('aria-controls')`);
  const dateSelect = `#${activePanel} select`;
  const link = `#${activePanel} a[href^="#/history"]`;
  const calendarDate = '[aria-label="달력"] button[aria-pressed="true"]';
  const calendarLabel = () => read(`document.querySelector(${JSON.stringify(calendarDate)})?.getAttribute('aria-label')`);
  async function openHistoryByKeyboard(days, priorDay = false) {
    await click('[aria-label="기간"] button', `${days}일`);
    await eventually(() => read(`document.querySelector('${dateSelect}')?.options.length`), count => count === days, 'the date picker has the selected period');
    await read(`document.querySelector('${dateSelect}').focus()`);
    await key('End', 35);
    const date = await read(`Array.from(document.querySelector('${dateSelect}').options).at(${priorDay ? -2 : -1}).value`);
    if (priorDay) await key('ArrowUp', 38);
    await eventually(() => read(`document.querySelector('${link}')?.getAttribute('href')`), href => href === `#/history?date=${date}`, 'the link targets the chosen date');
    await key('Tab', 9);
    assert.equal(await read(`document.activeElement.matches('${link}')`), true);
    await key('Enter', 13);
    await text('h1', '학습이력');
    assert.equal(await read('location.hash'), `#/history?date=${date}`);
    assert.equal(await read(`document.activeElement === document.querySelector(${JSON.stringify(calendarDate)})`), true,
      'the statistics link focuses the selected history date');
  }
  await read(`window.fixture.deferHistory = true`);
  await openHistoryByKeyboard(7, true);
  assert.match(await calendarLabel(), /기록 불러오는 중/);
  await eventually(() => read(`typeof window.fixture.finishHistory === 'function'`), Boolean, 'the history request is pending');
  await read(`window.fixture.deferHistory = false; window.fixture.finishHistory(503)`);
  await text('[role="alert"]', '상체 기록을 불러오지 못했어요');
  await eventually(calendarLabel, label => label?.includes('기록을 불러오지 못함'), 'the focused date reports a query failure');
  const weekView = '[aria-label="달력 보기"] button[aria-pressed="true"]';
  await read(`document.querySelector(${JSON.stringify(weekView)}).focus()`);
  await click('[role="alert"] button', '다시 시도');
  await eventually(calendarLabel, label => label?.includes('기록 없음'), 'the date reports empty after a successful retry');
  assert.equal(await read(`document.activeElement === document.querySelector(${JSON.stringify(weekView)})`), true,
    'record loading does not steal focus');
  await click('nav a', '통계');
  await openHistoryByKeyboard(30);
  await click(historyList + ' ol button', '상체');
  await text('[aria-label="기록 상세"]', '종료 미확인');
  await click('[aria-label="달력 보기"] button', '월간');
  await noHorizontal(320, 568);
  await screen('review-history-320');
  await click('[aria-label="달력 보기"] button', '주간');
  await click('nav a', '통계');
  await read(`window.fixture.historyOffsets = []; window.fixture.requests = []`);
  await click('nav a', '학습이력');
  await eventually(() => read(`typeof window.fixture.finishHistoryPage === 'function'`), Boolean, 'the second history page is pending');
  await text('main [role="status"]', '상체 기록을 불러오는 중이에요');
  await click(historyList + ' button', '상체');
  await text('[aria-label="기록 상세"]', '상체');
  await read(`window.fixture.finishHistoryPage(503); delete window.fixture.finishHistoryPage`);
  await text('[role="alert"]', '상체 기록 일부를 불러오지 못했어요');
  await text('[aria-label="기록 상세"]', '상체');
  assert.equal(await read(`document.querySelector('${historyList} button[aria-pressed="true"]').textContent.includes('상체')`), true);
  await click('[role="alert"] button', '다시 시도');
  await eventually(() => read(`typeof window.fixture.finishHistoryPage === 'function'`), Boolean, 'the retried second history page is pending');
  await text('[aria-label="기록 상세"]', '상체');
  await read(`window.fixture.finishHistoryPage(200)`);
  await eventually(() => read(`!document.querySelector('main [role="alert"]') && document.querySelector('${historyList} button[aria-pressed="true"]').textContent.includes('깜빡임')`),
    Boolean, 'the remaining page adds the eye record to the selected camera run');
  await expectMinuteGap('분별 깜빡임 빈도');
  assert.deepEqual(await read(`window.fixture.historyOffsets`), [0, 1, 0, 1]);
  await noHorizontal(320, 568);
  await screen('review-history-paginated-320');
  await read(`delete window.fixture.historyOffsets; delete window.fixture.finishHistoryPage`);
  await click('nav a', '통계');

  await read(`window.fixture.failures = ['GET /api/records/history']; window.fixture.requests = []`);
  await click('nav a', '학습이력');
  await text('[role="alert"]', '상체 기록을 불러오지 못했어요');
  await text('[aria-label="기록 상세"]', '키보드');
  const keyboardRequests = `window.fixture.requests.filter(path => path === 'GET /api/records/keyboard').length`;
  const keyboardBeforeRetry = await read(keyboardRequests);
  await read(`window.fixture.failures = []`);
  await click('[role="alert"] button', '다시 시도');
  await text('section[aria-label$="기록"]:has(ol)', '상체');
  assert.equal(await read(keyboardRequests), keyboardBeforeRetry);
  await click('nav a', '통계');
  await read(`window.fixture.failures = ['GET /api/records/keyboard']`);
  await click('nav a', '학습이력');
  await text('[role="alert"]', '키보드 기록을 불러오지 못했어요');
  await text('section[aria-label$="기록"]:has(ol)', '상체');
  await read(`window.fixture.failures = ['GET /api/auth/me']`);
  await click('nav a', '설정');
  await text('section[aria-label="비밀번호 · 이메일"]', '이메일 조회 실패');
  assert.equal(await read(`[...document.querySelectorAll('section[aria-label="비밀번호 · 이메일"] button')].find(b => b.textContent.includes('재설정')).disabled`), true);
  await read(`window.fixture.failures = []`);
  await click('section[aria-label="비밀번호 · 이메일"] button', '이메일 다시 조회');
  await text('section[aria-label="비밀번호 · 이메일"]', 'moti@example.test');
  await read(`window.fixture.storeOriginal = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) {
    if (key === 'postureAI.notifications') throw new DOMException('fixture quota', 'QuotaExceededError');
    return window.fixture.storeOriginal.call(this, key, value);
  }`);
  await click('section[aria-label="알림"] [role="switch"]');
  await text('[role="alert"]', '설정을 저장하지 못했어요');
  assert.equal(await read(`localStorage.getItem('postureAI.notifications')`), 'off');
  assert.equal(await read(`document.querySelector('section[aria-label="알림"] [role="switch"]').getAttribute('aria-checked')`), 'false');
  await read(`Storage.prototype.setItem = window.fixture.storeOriginal`);
  await viewport(1100, 800);

  await click('nav a', 'AI 총평');
  const generation = () => click('section[aria-label="선택한 날짜의 측정 기록"] button', '총평 받기');
  const { today: reviewToday, prior: reviewPrior } = await read('fixture.reviewDates');
  const rangeKey = `${reviewPrior}:${reviewToday}`;
  const selectReviewDate = async date => {
    const [, month, day] = date.split('-').map(Number);
    const selector = `[aria-label="달력"] button[aria-label^="${month}월 ${day}일 ("]`;
    if (!await read(`!!document.querySelector(${JSON.stringify(selector)})`)) {
      await activate(date === reviewToday ? '다음 기간' : '이전 기간');
    }
    await click(selector);
  };
  const pendingReview = key => eventually(() => read(`typeof fixture.reviews[${JSON.stringify(key)}] === 'function'`), Boolean, `review request ${key}`);
  const resolveReview = (key, body, status = 200) => read(`fixture.reviews[${JSON.stringify(key)}](Response.json(${JSON.stringify(body)}, { status: ${status} }))`);
  const reviewMeta = { strengths: [], model: 'fixture', generatedAt: new Date().toISOString() };
  const recentReview = {
    ...reviewMeta, headline: '선택한 기간의 응답', sections: [
      { key: 'overall', title: '선택한 기간 총평', text: '선택한 날짜의 기록을 비교했어요.' },
      { key: 'keyboard', title: '키보드', text: '훈련 점수가 올랐어요.' },
    ], weaknesses: [], goals: ['같은 시간에 다시 측정하기'], caution: null,
  };
  await generation(); await pendingReview(reviewToday);
  assert.equal(await read(`fixture.reviewBodies[${JSON.stringify(reviewToday)}].date`), reviewToday);
  await text('[role="status"]', '총평 작성 중');
  assert.equal(await read(`[...document.querySelectorAll('main [role="status"]')].filter(node => node.textContent.includes('총평 작성 중')).length`), 1);
  await selectReviewDate(reviewToday);
  await text('main', '종료일을 선택하거나');
  await selectReviewDate(reviewPrior);
  if (reviewPrior.slice(0, 7) === reviewToday.slice(0, 7)) {
    await eventually(() => read(`document.querySelectorAll('${calendarDate}').length`), n => n === 3, 'all dates of the selected range are highlighted');
  }
  await generation(); await pendingReview(rangeKey);
  assert.deepEqual(await read(`(() => { const review = fixture.reviewBodies[${JSON.stringify(rangeKey)}]; return [review.from, review.to, review.days.map(day => day.date)]; })()`),
    [reviewPrior, reviewToday, [reviewToday]]);
  await resolveReview(rangeKey, recentReview);
  await text('main', recentReview.headline);
  await text('section[aria-label="키보드"]', '훈련 점수가 올랐어요.');
  await text('section[aria-label="다음 목표"]', '같은 시간에 다시 측정하기');
  await resolveReview(reviewToday, { message: '늦은 하루 오류' }, 503);
  assert.equal(await read(`document.querySelector('main').textContent.includes('늦은 하루 오류')`), false);
  await read('fixture.reviews = {}');
  await click('button', '다시 받기'); await pendingReview(rangeKey);
  await selectReviewDate(reviewToday); await generation(); await pendingReview(reviewToday);
  await resolveReview(reviewToday, { ...recentReview, headline: '선택한 하루의 응답', weaknesses: ['카메라 위치 확인하기'] });
  await text('main', '선택한 하루의 응답');
  await text('section[aria-label="아쉬운 점"]', '카메라 위치 확인하기');
  await resolveReview(rangeKey, { ...recentReview, headline: '늦은 기간 응답' });
  await text('main', '선택한 하루의 응답');
  const typeAddress = value => read(`(() => {
    const input = document.querySelector('input[aria-label="동네 이름이나 주소"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '${value}');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const hospitals = 'section[aria-label="주변 병원 찾기"]';
  await typeAddress('새동네'); await click(`${hospitals} button`, '찾기'); await text(hospitals, '새동네 병원');
  await typeAddress('실패 주소'); await click(`${hospitals} button`, '찾기'); await text(hospitals, '검색에 실패했어요');
  assert.equal(await read(`document.querySelector('${hospitals}').textContent.includes('새동네 병원')`), false);
  await click(hospitals + ' button', '다시 시도'); await text(hospitals, '검색에 실패했어요');
  await typeAddress('다른동네'); await click(`${hospitals} button`, '찾기'); await text(hospitals, '다른동네 병원');
  await click(hospitals + ' button', '안과'); await text(hospitals, '안과를 찾지 못했어요');

  await click('nav a', '학습');
  await modeButton('상체', '시작'); await modeButton('키보드', '시작');
  await click('nav a', '설정'); await click('button', '통계 삭제');
  await text('dialog[open]', 'moti 계정');
  await click('dialog button', '유지하기');
  assert.equal(await read('window.fixture.deleteCount'), 0);
  await read(`window.fixture.failures = ['DELETE /api/records']`);
  await click('button', '통계 삭제'); await click('dialog button', '삭제하기');
  await text('dialog[open]', '이 시험의 요청이 실패했습니다.');
  await click('dialog button', '좋아요');
  await click('nav a', '학습');
  await eventually(() => read(`document.querySelectorAll('button[aria-label$=" 중지"]').length`), count => count === 2, 'both measurements stay active after failed deletion');
  await click('nav a', '설정');
  await read(`window.fixture.failures = []`);
  await click('button', '통계 삭제'); await click('dialog button', '삭제하기');
  await text('dialog[open]', '삭제 완료');
  await click('dialog button', '좋아요');
  await click('nav a', '학습');
  await eventually(() => read(`document.querySelectorAll('button[aria-label$=" 시작"]').length`), count => count === 2, 'deletion ends both measurements');
  assert.equal(await read('window.fixture.deleteCount'), 1);
  await read(`window.fixture.failures = ['POST /api/records/posture']`);
  await modeButton('상체', '시작');
  await click('nav a', '통계');
  await text('[data-recording-status]', '저장 실패');
  await read(`window.fixture.failures = []`);
  await click('[data-recording-status] button', '저장 재시도');
  await eventually(() => read(`!document.querySelector('[data-recording-status]')`), Boolean, 'save retry clears the banner in statistics');
  await click('nav a', '학습');
  await modeButton('상체', '중지');
  await click('dialog[open] button', '닫기');
  await read(`Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 480;
    canvas.getContext('2d').fillRect(0, 0, 640, 480);
    const stream = canvas.captureStream(3);
    window.fixture.camera = { canvas, track: stream.getVideoTracks()[0] };
    return stream;
  } })`);
  await modeButton('상체', '시작');
  await eventually(() => read(`window.fixture.camera?.track.readyState`), value => value === 'live', 'camera running before cross-tab logout');
  const { targetId } = await send('Target.createTarget', { url: base + '/#/login' });
  const peerPage = await eventually(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(page => page.id === targetId), Boolean, 'second browser tab');
  const peer = await connect(peerPage.webSocketDebuggerUrl);
  try {
    const peerOrigin = await eventually(async () => (await peer.send('Runtime.evaluate', { expression: 'location.origin', returnByValue: true })).result.value,
      value => value === base, 'same-origin second tab');
    assert.equal(peerOrigin, base);
    await peer.send('Runtime.evaluate', { expression: `localStorage.removeItem('moti.session')` });
    await text('h1', 'Moti');
    await eventually(() => read(`window.fixture.camera?.track.readyState`), value => value === 'ended', 'the camera stops when another tab logs out');
  } finally { peer.close(); await send('Target.closeTarget', { targetId }); }
  console.log('Checked narrow navigation and gauges, history and save retries, stale responses, both-mode deletion and cross-tab camera cleanup.');
} finally {
  devTools?.close();
  chrome?.kill();
  await server.close();
  const profilePath = await realpath(profile);
  if (dirname(profilePath) === await realpath(tmpdir()) && basename(profilePath).startsWith(profileName)) {
    await rm(profilePath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
  }
}
