import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

export const pool = mysql.createPool({
  host:     process.env.DB_HOST     ?? '127.0.0.1',
  port:     Number(process.env.DB_PORT ?? 3306),
  user:     process.env.DB_USER     ?? 'root',
  password: process.env.DB_PASSWORD ?? 'root1234!',
  database: process.env.DB_NAME     ?? 'Graduation_Project',
  waitForConnections: true,
  connectionLimit: 10,
  timezone: '+09:00',
});
