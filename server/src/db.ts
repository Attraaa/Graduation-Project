import mysql from 'mysql2/promise';
import type { ServerConfig } from './config.js';

export function createDatabase(config: ServerConfig['database']) {
  return mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 10,
    timezone: '+09:00',
  });
}
