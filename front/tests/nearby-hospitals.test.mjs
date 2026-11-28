import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isKakaoPlaceUrl } from '../electron/externalLinks.ts';

const bundle = await build({ stdin: { contents: [
  "export { default as NearbyHospitals } from './src/features/hospitals/NearbyHospitals.tsx';",
  "export { findHospitals, distanceText, DEPARTMENTS } from './src/features/hospitals/api.ts';",
].join('\n'), resolveDir: process.cwd() },
  bundle: true, write: false, logLevel: 'error', platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'],
  loader: { '.html': 'text' } });
const compiled = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const app = compiled.exports;

test('only Kakao Map place pages may leave the app for the default browser', () => {
  assert.equal(isKakaoPlaceUrl('https://place.map.kakao.com/12345'), true);
  for (const url of ['http://place.map.kakao.com/12345', 'https://place.map.kakao.com.evil.example/1', 'https://evil.example/place.map.kakao.com/1',
    'https://place.map.kakao.com/12345/../../x', 'https://place.map.kakao.com/abc', 'javascript:alert(1)', 'not a url']) {
    assert.equal(isKakaoPlaceUrl(url), false, url);
  }
});

test('a search sends the trimmed place, or the device location rounded to about 1 km', async t => {
  globalThis.localStorage = { getItem: () => JSON.stringify({ token: 't', user: { id: '7', username: 'member', nickname: '회원' } }) };
  const requests = [], originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, ...options });
    return new Response(JSON.stringify({ center: { lat: 37.57, lng: 126.98, label: '현재 위치 근처' }, hospitals: [] }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  await app.findHospitals('정형외과', { query: ' 강남역 ' });
  await app.findHospitals('안과', { lat: 37.56654, lng: 126.97803 });
  assert.ok(requests.every(call => call.url === '/api/hospitals' && call.method === 'POST'));
  assert.deepEqual(requests.map(call => JSON.parse(call.body)), [
    { department: '정형외과', query: '강남역' },
    { department: '안과', lat: 37.57, lng: 126.98 },
  ]);
});

test('distances read in meters below 1 km and in kilometers above', () => {
  assert.equal(app.distanceText(264), '264m');
  assert.equal(app.distanceText(1234), '1.2km');
});

test('before a search the card offers the four departments, a place box and the current location, with the notice', () => {
  const out = renderToStaticMarkup(createElement(app.NearbyHospitals));
  assert.deepEqual([...out.matchAll(/aria-pressed="(true|false)"[^>]*>([^<]+)</g)].map(match => [match[2], match[1]]),
    [['정형외과', 'true'], ['재활의학과', 'false'], ['신경외과', 'false'], ['안과', 'false']]);
  assert.match(out, /불편감이나 통증이 계속되면 전문의와 상담하세요\./);
  assert.match(out, /추천이나 진료 판단이 아니에요/);
  assert.match(out, /aria-label="동네 이름이나 주소"/);
  assert.match(out, />현재 위치<\/button>/);
  assert.doesNotMatch(out, /병원 위치 지도/);
});
