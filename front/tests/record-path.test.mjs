import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveRecordDatabasePath } from '../electron/recordDatabasePath.ts';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'moti-record-path-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('default record database path is relative to the repository root', t => {
  const root = fixture(t);
  const moduleDirectory = join(root, 'front', 'dist-electron');
  const userData = join(root, 'user-data');
  assert.equal(
    resolveRecordDatabasePath(moduleDirectory, userData),
    join(root, 'database', 'sqlite', 'posture.sqlite'),
  );
});

test('existing userData database is copied once without overwriting the relative database', t => {
  const root = fixture(t);
  const moduleDirectory = join(root, 'front', 'dist-electron');
  const userData = join(root, 'user-data');
  const legacyDirectory = join(userData, 'database');
  mkdirSync(legacyDirectory, { recursive: true });
  writeFileSync(join(legacyDirectory, 'posture.sqlite'), 'legacy database');
  writeFileSync(join(legacyDirectory, 'posture.sqlite-wal'), 'legacy wal');

  const target = resolveRecordDatabasePath(moduleDirectory, userData);
  assert.equal(readFileSync(target, 'utf8'), 'legacy database');
  assert.equal(readFileSync(`${target}-wal`, 'utf8'), 'legacy wal');

  writeFileSync(target, 'current database');
  assert.equal(resolveRecordDatabasePath(moduleDirectory, userData), target);
  assert.equal(readFileSync(target, 'utf8'), 'current database');
});
