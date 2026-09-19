import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import electron from 'electron';

// An isolated profile only: never open the developer's Moti userData directory.
const output = resolve('.moti-cache');
mkdirSync(output, { recursive: true });
const profile = mkdtempSync(resolve(output, 'records-electron-'));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
for (const phase of ['seed', 'verify']) {
  const result = spawnSync(electron, [resolve('tests/electron-record-smoke.mjs'), profile, phase], {
    env, stdio: 'inherit', windowsHide: true, timeout: 60_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Electron record persistence/UI/clear smoke passed. Artifacts: ' + profile);
