import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/**
 * The default is relative to dist-electron/main.js, so a development checkout
 * stores records at <repository>/database/sqlite/posture.sqlite.
 */
export function resolveRecordDatabasePath(moduleDirectory: string, userDataDirectory: string) {
  const directory = process.env.MOTI_RECORD_DATABASE_DIRECTORY
    ? path.resolve(process.env.MOTI_RECORD_DATABASE_DIRECTORY)
    : path.resolve(moduleDirectory, '../../database/sqlite');
  mkdirSync(directory, { recursive: true });

  const target = path.join(directory, 'posture.sqlite');
  const legacy = path.join(userDataDirectory, 'database', 'posture.sqlite');
  if (!existsSync(target) && existsSync(legacy)) {
    copyFileSync(legacy, target);
    // WAL may contain the most recent committed pages. SQLite recreates SHM.
    if (existsSync(`${legacy}-wal`)) copyFileSync(`${legacy}-wal`, `${target}-wal`);
  }
  return target;
}
