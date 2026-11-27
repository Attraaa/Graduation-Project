import assert from 'node:assert/strict';
import test from 'node:test';
import { readConfig } from '../src/config.js';

const valid = { JWT_SECRET: 'test-only-secret-012345678901234567890' };

test('startup rejects missing, short, or copied example JWT secrets', () => {
  for (const JWT_SECRET of [undefined, 'dev_secret_change_me', 'change_this_to_a_long_random_string']) {
    assert.throws(() => readConfig({ JWT_SECRET }), /JWT_SECRET/);
  }
});

test('startup rejects invalid ports and malformed token expiration', () => {
  for (const PORT of ['abc', '0', '65536', '4000.5']) {
    assert.throws(() => readConfig({ ...valid, PORT }), /PORT/);
  }
  assert.throws(() => readConfig({ ...valid, JWT_EXPIRES_IN: 'forever' }), /JWT_EXPIRES_IN/);
  assert.throws(() => readConfig({ ...valid, JWT_EXPIRES_IN: '0d' }), /JWT_EXPIRES_IN/);
});

test('the review gateway accepts private HTTPS and loopback HTTP', () => {
  assert.equal(readConfig(valid).reviewGatewayUrl, null);
  for (const url of ['https://mini.example/review', 'http://127.0.0.1:8765/review']) {
    assert.equal(readConfig({ ...valid, MOTI_REVIEW_GATEWAY_URL: url }).reviewGatewayUrl, url);
  }
  assert.throws(() => readConfig({ ...valid, MOTI_REVIEW_GATEWAY_URL: 'http://external.example/review' }));
});

test('the Kakao REST API key is optional and trimmed; a blank value turns the hospital search off', () => {
  assert.equal(readConfig(valid).kakaoRestApiKey, null);
  assert.equal(readConfig({ ...valid, KAKAO_REST_API_KEY: '  ' }).kakaoRestApiKey, null);
  assert.equal(readConfig({ ...valid, KAKAO_REST_API_KEY: ' kakao-test\n' }).kakaoRestApiKey, 'kakao-test');
});

test('explicit setup values produce a usable runtime configuration', () => {
  const config = readConfig({ ...valid, PORT: '4100', JWT_EXPIRES_IN: '30m' });
  assert.equal(config.port, 4100);
  assert.equal(config.jwt.expiresIn, 1800);
  assert.equal(config.database.database, 'moti');
});
