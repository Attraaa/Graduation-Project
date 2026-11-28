import mysql from 'mysql2/promise';
import type { ServerConfig } from './config.js';
import { createAuth } from './auth.js';
import type { Pool, RowDataPacket } from 'mysql2/promise';

export function createDatabase(config: ServerConfig['database']) {
  return mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 10,
    timezone: '+09:00',
  });
}

export function createDatabaseAuth(config: ServerConfig['jwt'], pool: Pool) {
  return createAuth(config, async id => {
    const [[user]] = await pool.query<RowDataPacket[]>('SELECT session_version FROM users WHERE id = ?', [id]);
    return user ? Number(user.session_version) : null;
  });
}
