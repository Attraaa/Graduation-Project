import assert from 'node:assert/strict';
import test from 'node:test';
import { comparePassword, hashPassword } from '../src/auth.js';

test('bcrypt 6 verifies stored hashes from the bcrypt 5.1.1 test vectors', async () => {
  // 기존 해시를 다시 저장하거나 사용자에게 비밀번호 재설정을 요구하지 않는지 검증합니다.
  // bcrypt@5.1.1 공식 고정 벡터: test/implementation.test.js, commit a0a88a88a304a145f5bfcfda69ac6d58d3017001.
  const vectors = [
    ['U*U', '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW'],
    ['p@5sw0rd', '$2b$12$zQ4CooEXdGqcwi0PHsgc8eAf0DLXE/XHoBE8kCSGQ97rXwuClaPam'],
  ];
  for (const [plain, hash] of vectors) {
    assert.equal(await comparePassword(plain, hash), true);
    assert.equal(await comparePassword('incorrect-password', hash), false);
  }
});

test('new Unicode passwords can be hashed and verified on the Windows runtime', async () => {
  const plain = '새로운 Moti 비밀번호';
  const hash = await hashPassword(plain);
  assert.equal(await comparePassword(plain, hash), true);
  assert.equal(await comparePassword('다른 비밀번호', hash), false);
});
