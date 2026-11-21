import assert from 'node:assert/strict';
import { once } from 'node:events';
import test, { type TestContext } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createAuth } from '../src/auth.js';
import { handleError } from '../src/http.js';
import { createHospitalsRouter } from '../src/routes/hospitals.js';
import { createKakaoHospitalSearch, type FindHospitals } from '../src/services/hospitals.js';

const auth = createAuth({ secret: 'test-only-secret-012345678901234567890', expiresIn: 3600 });
const token = auth.signToken({ userId: 1, username: 'member' });

/** Answers Kakao requests from the given handler and records the path, parameters and headers of each. */
function kakao(answer: (path: string, params: URLSearchParams) => { status?: number; documents?: unknown[] } | Error) {
  const calls: { path: string; params: Record<string, string>; authorization: string | null }[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/v2/local/search/', '');
    calls.push({ path, params: Object.fromEntries(url.searchParams), authorization: new Headers(init?.headers).get('authorization') });
    const reply = answer(path, url.searchParams);
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify({ documents: reply.documents ?? [] }), { status: reply.status ?? 200 });
  }) as typeof fetch;
  return { calls, find: createKakaoHospitalSearch('kakao-test-key', fetcher) };
}

async function start(t: TestContext, find: FindHospitals | null) {
  const app = express();
  app.use('/api/hospitals', createHospitalsRouter(find, auth));
  app.use(handleError);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/hospitals`;
  return async (query: Record<string, string>, signedIn = true) => {
    const response = await fetch(`${base}?${new URLSearchParams(query)}`, {
      headers: signedIn ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(10_000),
    });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
}

const ORTHOPEDICS = {
  id: '101', place_name: '우리본정형외과의원', category_name: '의료,건강 > 병원 > 정형외과', address_name: '서울 중구 태평로1가 1',
  road_address_name: '서울 중구 세종대로 1', phone: '02-000-0000', distance: '264', place_url: 'http://place.map.kakao.com/101', x: '126.977', y: '37.567',
};
const NO_ROAD = { ...ORTHOPEDICS, id: '102', place_name: '다른정형외과', road_address_name: '', distance: '512', place_url: 'http://place.map.kakao.com/102' };

test('signing in comes first, and a server without the Kakao key answers 503', async t => {
  const get = await start(t, null);
  assert.equal((await get({ department: '정형외과', query: '시청역' }, false)).status, 401);
  assert.deepEqual(await get({ department: '정형외과', query: '시청역' }),
    { status: 503, body: { message: '주변 병원 찾기가 아직 설정되지 않았어요. 서버의 server/.env에 KAKAO_REST_API_KEY를 넣어 주세요.' } });
});

test('unknown departments, missing or out-of-range locations and long queries are refused before calling Kakao', async t => {
  const { calls, find } = kakao(() => ({ documents: [] }));
  const get = await start(t, find);
  for (const query of [
    { department: '치과', query: '시청역' }, { department: '정형외과' }, { department: '정형외과', query: '  ' },
    { department: '정형외과', query: '가'.repeat(101) }, { department: '정형외과', lat: '37.5' },
    { department: '정형외과', lat: '51.5', lng: '-0.1' }, { department: '정형외과', lat: 'abc', lng: '127' },
  ]) {
    assert.equal((await get(query)).status, 400, JSON.stringify(query));
  }
  assert.equal(calls.length, 0);
});

test('a typed place is looked up as an address, then as a place name, and the hospitals come nearest first', async t => {
  const { calls, find } = kakao((path, params) => (path === 'address.json' ? { documents: [] }
    : params.get('category_group_code') ? { documents: [ORTHOPEDICS, NO_ROAD] }
      : { documents: [{ place_name: '시청역 1호선', x: '126.9772', y: '37.5657' }] }));
  const get = await start(t, find);
  const { status, body } = await get({ department: '정형외과', query: ' 시청역 ' });
  assert.equal(status, 200);
  assert.deepEqual(body, {
    center: { lat: 37.5657, lng: 126.9772, label: '시청역 1호선' },
    hospitals: [
      { id: '101', name: '우리본정형외과의원', category: '정형외과', address: '서울 중구 세종대로 1', phone: '02-000-0000',
        distance: 264, lat: 37.567, lng: 126.977, url: 'https://place.map.kakao.com/101' },
      { id: '102', name: '다른정형외과', category: '정형외과', address: '서울 중구 태평로1가 1', phone: '02-000-0000',
        distance: 512, lat: 37.567, lng: 126.977, url: 'https://place.map.kakao.com/102' },
    ],
  });
  assert.deepEqual(calls.map(call => [call.path, call.params]), [
    ['address.json', { query: '시청역', size: '1' }],
    ['keyword.json', { query: '시청역', size: '1' }],
    ['keyword.json', { query: '정형외과', category_group_code: 'HP8', x: '126.9772', y: '37.5657', radius: '5000', sort: 'distance', size: '15' }],
  ]);
  assert.ok(calls.every(call => call.authorization === 'KakaoAK kakao-test-key'));
});

test('a device location is searched and returned only to about 1 km', async t => {
  const { calls, find } = kakao(() => ({ documents: [] }));
  const get = await start(t, find);
  const { status, body } = await get({ department: '안과', lat: '37.56654', lng: '126.97803' });
  assert.deepEqual({ status, body }, { status: 200, body: { center: { lat: 37.57, lng: 126.98, label: '현재 위치 근처' }, hospitals: [] } });
  assert.deepEqual(calls.map(call => [call.params.x, call.params.y, call.params.query]), [['126.98', '37.57', '안과']]);
});

test('a place nobody can find is a 404, and Kakao failures become messages without logging the place', async t => {
  const logged: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logged.push(args); });
  const cases: [ReturnType<typeof kakao>['find'], number, string][] = [
    [kakao(() => ({ documents: [] })).find, 404, '입력한 위치를 찾지 못했어요. 동네 이름이나 주소를 다시 입력해 주세요.'],
    [kakao(() => ({ status: 401 })).find, 503, '주변 병원 찾기를 사용할 수 없어요. 서버의 KAKAO_REST_API_KEY와 카카오맵 사용 설정을 확인해 주세요.'],
    [kakao(() => ({ status: 429 })).find, 429, '병원 찾기 요청이 많아요. 잠시 후 다시 시도해 주세요.'],
    [kakao(() => ({ status: 500 })).find, 502, '주변 병원을 찾지 못했어요. 잠시 후 다시 시도해 주세요.'],
    [kakao(() => new Error('offline')).find, 504, '지도 검색 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'],
  ];
  for (const [find, status, message] of cases) {
    const get = await start(t, find);
    assert.deepEqual(await get({ department: '재활의학과', query: '우리집 앞 놀이터' }), { status, body: { message } });
  }
  assert.ok(logged.length > 0);
  assert.ok(logged.every(args => !JSON.stringify(args).includes('놀이터')));
});
