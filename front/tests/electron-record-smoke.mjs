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
  if (phase === 'seed') {
    for (const record of [batch('turtle', 'demo', 'turtle', 50), batch('shoulder', 'demo', 'shoulder', 75, 'running'), batch('other', 'admin', 'turtle', 20)]) {
      value(await call('write', record)); value(await call('write', record));
    }
    assert.equal((await call('write', { sql: 'delete from records' })).ok, false);
  } else {
    assert.equal(value(await call('detail', 'demo', 'shoulder')).record.status, 'interrupted');
  }
  assert.equal(value(await call('list', query)).records.length, 2);
  assert.equal(value(await call('statistics', { ...query, mode: 'turtle' }))[0].scoreTimeSum, 25000);
  assert.equal((await call('detail', 'admin', 'turtle')).ok, false);
  await route('/statistics');
  await until("document.body.innerText.includes('50.0점') && document.querySelector('.recharts-surface') !== null");
  assert.ok((await js('document.body.innerText')).includes('실제 측정 데이터와 연결되지 않았으며'));
  await delay(600);
  console.log('capture statistics');
  await screenshot('statistics');
  await js("const select=document.querySelector('select');select.value='shoulder';select.dispatchEvent(new Event('change',{bubbles:true}))");
  await until("document.body.innerText.includes('75.0점')");
  console.log('statistics modes passed');
  await route('/history');
  await until("document.body.innerText.includes('50.0점') && document.body.innerText.includes('75.0점')");
  for (const view of ['일간', '월간', '주간']) { await click(view); await delay(250); }
  await screenshot('history');
  await js("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('50.0점')).click()");
  await until("document.body.innerText.includes('학습이력으로 돌아가기') && !document.body.innerText.includes('불러오는 중') && document.querySelector('.recharts-dot') !== null");
  await screenshot('detail');
  console.log('history detail passed');
  if (phase === 'seed') {
    const other = new BrowserWindow({ show: false, webPreferences: { preload: resolve('dist-electron/preload.cjs') } });
    await other.loadFile(resolve('dist/index.html'));
    assert.equal((await other.webContents.executeJavaScript("window.motiRecords.generation('demo')")).ok, false);
    other.destroy();
  } else {
    await route('/settings'); await click('통계 삭제'); await until("document.body.innerText.includes('유지하기')");
    await click('유지하기'); assert.equal(value(await call('list', query)).records.length, 2);
    await click('통계 삭제'); await until("document.body.innerText.includes('삭제하기')"); await click('삭제하기');
    await until("document.body.innerText.includes('삭제 완료')");
    assert.equal(value(await call('list', query)).records.length, 0);
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
