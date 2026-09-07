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

test('explicit setup values produce a usable runtime configuration', () => {
  const config = readConfig({ ...valid, PORT: '4100', JWT_EXPIRES_IN: '30m' });
  assert.equal(config.port, 4100);
  assert.equal(config.jwt.expiresIn, 1800);
  assert.equal(config.database.database, 'moti');
});
