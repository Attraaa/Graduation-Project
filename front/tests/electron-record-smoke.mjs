import { app, BrowserWindow, ipcMain } from 'electron';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { once } from 'node:events';

const [profile, phase] = process.argv.slice(2);
assert.ok(profile && ['seed', 'verify'].includes(phase));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
const deadline = setTimeout(() => { console.error('Electron record smoke timed out'); app.exit(1); }, 50_000);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let created = 0;
app.on('browser-window-created', (_event, window) => {
  created += 1;
  window.webContents.on('did-fail-load', (_event, code, message) => console.error('load failed', code, message));
  window.on('show', () => window.hide());
  if (created !== 2) return; // Existing createWindow creates splash first, main second.
  window.webContents.once('did-finish-load', () => run(window).catch(error => { console.error(error); app.exit(1); }));
});

async function run(window) {
  console.log('run', phase);
  window.webContents.setBackgroundThrottling(false);
  const js = source => window.webContents.executeJavaScript(source);
  const screenshot = async name => {
    // Hidden Chromium surfaces may return their previous frame on the first capture.
    await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    await delay(200);
    writeFileSync(resolve(profile, phase + '-' + name + '.png'), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  };
  async function until(source) {
    for (let attempt = 0; attempt < 100; attempt++) { if (await js(source)) return; await delay(100); }
    throw new Error('UI condition failed: ' + source + '\n' + await js('document.body.innerText'));
  }
  const click = text => js(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!button)throw Error('Button missing');button.click()})()`);
  const route = async hash => { await js(`location.hash=${JSON.stringify(hash)}`); await delay(250); };
  await js("localStorage.setItem('postureAI.currentUserId','demo'); localStorage.setItem('isLoggedIn','true')");
  const now = new Date(); now.setHours(10, 0, 0, 0);
  const start = now.getTime();
  const date = new Date(start - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const query = { owner: 'demo', from: date, to: date };
  const call = (command, ...args) => js(`window.motiRecords.${command}(...${JSON.stringify(args)})`);
  const value = response => { assert.equal(response.ok, true, response.error); return response.value; };
  const batch = (id, owner, mode, score, status = 'finished') => ({
    schemaVersion: 1, aggregationPolicyVersion: 'capture-minute-v1', generation: 0, sequence: 0,
    record: { id, owner, mode, startedAt: start, updatedAt: start + 1000, offsetMinutes: now.getTimezoneOffset(),
      scorePolicyVersion: 'smoke-v1', habitPolicyVersion: 'smoke-h1', status, longestContinuousMs: 500,
      runMs: 1000, validMs: 500, scoreTimeSum: score * 500, deviationMs: 0, deviationEpisodeCount: 0 },
    buckets: [{ minute: Math.floor(start / 60_000) * 60_000, runMs: 1000, validMs: 500, scoreTimeSum: score * 500, deviationMs: 0, deviationEpisodeCount: 0 }],
  });
  const keyboard = { schemaVersion: 1, generation: 0, sequence: 0,
    record: { id: 'keyboard', owner: 'demo', startedAt: start, updatedAt: start + 1000, offsetMinutes: now.getTimezoneOffset(),
      status: 'running', policyVersion: 'ansi-qwerty-touch:2.0.0', recognitionVersion: 'hands-label-distance-v2', nearbyCredit: 70, total: 10 },
    counts: [{ date, code: 'KeyA', context: 'plain', finger: 'left:pinky', verdict: 'preferred', reason: 'preferred-finger', count: 8 },
      { date, code: 'KeyA', context: 'plain', finger: 'left:ring', verdict: 'nearby', reason: 'neighboring-finger', count: 2 }] };
  if (phase === 'seed') {
    for (const record of [batch('turtle', 'demo', 'turtle', 50), batch('shoulder', 'demo', 'shoulder', 75, 'running'), batch('other', 'admin', 'turtle', 20)]) {
      value(await call('write', record)); value(await call('write', record));
    }
    assert.equal((await call('write', { sql: 'delete from records' })).ok, false);
    value(await call('writeKeyboard', keyboard)); value(await call('writeKeyboard', keyboard));
    assert.equal((await call('writeKeyboard', { ...keyboard, text: 'forbidden' })).ok, false);
    assert.equal((await js("window.motiKeyboard.updateSettings({stopShortcut:'Control+Alt+F9'})")).stopShortcut, 'Control+Alt+F9');
    assert.equal(await js("window.motiKeyboard.updateSettings({apps:[]}).then(()=>false,()=>true)"), true);
  } else {
    assert.equal(value(await call('detail', 'demo', 'shoulder')).record.status, 'interrupted');
    assert.equal(value(await call('keyboardDetail', 'demo', 'keyboard')).record.status, 'interrupted');
    assert.equal((await js('window.motiKeyboard.settings()')).stopShortcut, 'Control+Alt+F9');
  }
  assert.equal(value(await call('keyboardStatistics', query))[0].record.total, 10);
  assert.equal(value(await call('list', query)).records.length, 2);
  assert.equal(value(await call('statistics', { ...query, mode: 'turtle' }))[0].scoreTimeSum, 25000);
  assert.equal((await call('detail', 'admin', 'turtle')).ok, false);
  await route('/statistics');
  await until("document.body.innerText.includes('50.0점') && document.querySelector('.recharts-surface') !== null");
  assert.ok((await js('document.body.innerText')).includes('실제 측정 데이터와 연결되지 않았으며'));
  await delay(600);
  console.log('capture statistics');
  await screenshot('statistics');
  await until("document.body.innerText.includes('75.0점') && document.body.innerText.includes('50.0점')");
  assert.deepEqual(await js("[...document.querySelector('[aria-label=\"통계 모드\"]').options].map(option=>option.textContent)"), ['안구', '상체', '키보드']);
  assert.equal(await js("(()=>{const a=document.querySelector('[aria-label=\"목 통계\"]'),b=document.querySelector('[aria-label=\"어깨 통계\"]');return a.getBoundingClientRect().top===b.getBoundingClientRect().top})()"), true);
  console.log('independent neck and shoulder statistics passed');
  await js("{ const select=document.querySelector('[aria-label=\"통계 모드\"]');select.value='keyboard';select.dispatchEvent(new Event('change',{bubbles:true})); }");
  await until("document.body.innerText.includes('94.0점') && document.body.innerText.includes('80.0%') && document.body.innerText.includes('키별 히트맵')");
  await screenshot('keyboard-statistics');
  await js("[...document.querySelectorAll('h2')].find(h=>h.textContent.includes('키별 히트맵')).scrollIntoView()");
  await screenshot('keyboard-heatmap');
  await js("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('상세 보기')).click()");
  await until("document.body.innerText.includes('전체 세션')");
  await js("{ const select=document.querySelector('[aria-label=\"통계 모드\"]');select.value='upper_body';select.dispatchEvent(new Event('change',{bubbles:true})); }");
  await until("document.body.innerText.includes('75.0점') && document.body.innerText.includes('50.0점') && !document.body.innerText.includes('키별 히트맵')");
  console.log('keyboard statistics and return to upper-body statistics passed');
  await js("{ const select=document.querySelector('[aria-label=\"통계 모드\"]');select.value='eye';select.dispatchEvent(new Event('change',{bubbles:true})); }");
  await until("document.body.innerText.includes('기록 저장은 아직 연결되지 않아') && !document.body.innerText.includes('목 점수') && !document.body.innerText.includes('키별 히트맵')");
  await screenshot('eye-statistics');
  await click('안구 모드 열기');
  await until("document.body.innerText.includes('안구 모드 시작') && document.body.innerText.includes('관찰한 깜빡임')");
  await screenshot('eye-ready');
  console.log('eye mode and statistics availability passed');
  await route('/dashboard');
  await until("document.body.innerText.includes('상체 자세 모니터링') && document.body.innerText.includes('안구 모드') && document.body.innerText.includes('키보드 모드')");
  assert.deepEqual(await js("[...document.querySelectorAll('h2')].map(title=>title.textContent).filter(title=>['안구 모드','상체 자세 모니터링','키보드 모드'].includes(title))"), ['안구 모드', '상체 자세 모니터링', '키보드 모드']);
  await screenshot('dashboard-modes');
  await route('/learn/upper_body');
  await until("document.body.innerText.includes('상체 자세 모니터링') && document.body.innerText.includes('목 점수') && document.body.innerText.includes('어깨 점수')");
  await screenshot('upper-body');
  await js("[...document.querySelectorAll('h2')].find(h=>h.textContent==='목 점수').scrollIntoView({block:'start'})");
  assert.equal(await js("(()=>{const titles=[...document.querySelectorAll('h2')];return titles.find(h=>h.textContent==='목 점수').getBoundingClientRect().top===titles.find(h=>h.textContent==='어깨 점수').getBoundingClientRect().top})()"), true);
  await screenshot('upper-body-scores');
  await route('/history');
  await until("document.body.innerText.includes('50.0점') && document.body.innerText.includes('75.0점')");
  for (const view of ['일간', '월간', '주간']) { await click(view); await delay(250); }
  await screenshot('history');
  await js("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('50.0점')).click()");
  await until("document.body.innerText.includes('학습이력으로 돌아가기') && !document.body.innerText.includes('불러오는 중') && document.querySelector('.recharts-dot') !== null");
  await screenshot('detail');
  console.log('history detail passed');
  if (phase === 'seed') {
    await route('/learn/keyboard');
    await until("document.body.innerText.includes('카메라 연결하고 시작') && document.body.innerText.includes('승인한 일반 앱도 관찰')");
    await screenshot('keyboard-ready');
    await js("document.querySelector('details').open=true; document.querySelector('details').scrollIntoView()");
    await screenshot('camera-settings');
    await route('/settings');
    await until("document.body.innerText.includes('일반 앱 실행 파일 승인')");
    await js("[...document.querySelectorAll('h2')].find(h=>h.textContent.includes('키보드')).scrollIntoView()");
    await screenshot('observation-settings');
    const other = new BrowserWindow({ show: false, webPreferences: { preload: resolve('dist-electron/preload.cjs') } });
    await other.loadFile(resolve('dist/index.html'));
    assert.equal((await other.webContents.executeJavaScript("window.motiRecords.generation('demo')")).ok, false);
    assert.equal(await other.webContents.executeJavaScript("window.motiKeyboard.settings().then(()=>false,()=>true)"), true);
    other.destroy();
  } else {
    await route('/settings'); await click('통계 삭제'); await until("document.body.innerText.includes('유지하기')");
    await click('유지하기'); assert.equal(value(await call('list', query)).records.length, 2);
    await click('통계 삭제'); await until("document.body.innerText.includes('삭제하기')"); await click('삭제하기');
    await until("document.body.innerText.includes('삭제 완료')");
    assert.equal(value(await call('list', query)).records.length, 0);
    assert.equal(value(await call('keyboardStatistics', query)).length, 0);
    assert.equal(value(await call('list', { ...query, owner: 'admin' })).records.length, 1);
    assert.equal((await call('write', batch('turtle', 'demo', 'turtle', 50))).ok, false);
    await route('/statistics'); await until("document.body.innerText.includes('기록이 없습니다')");
  }
  // The real renderer's flush handler must acknowledge the normal close.
  let closeReady = false;
  ipcMain.once('records:close-ready', (_event, saved) => { closeReady = saved === true; });
  await delay(3000); // Allow the existing splash lifetime to finish before closing.
  const closed = once(window, 'closed'); window.close(); await closed;
  assert.equal(closeReady, true);
  console.log('PASS actual Electron ' + phase + ': IPC, UI, normal close');
  clearTimeout(deadline);
}
console.log('loading main', app.isReady());
await import('../dist-electron/main.js');
console.log('main imported', app.isReady());
