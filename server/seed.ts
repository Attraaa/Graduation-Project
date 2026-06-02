/**
 * npm run seed
 * admin/admin, demo/demo1234 기본 계정 삽입
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';

const pool = mysql.createPool({
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     Number(process.env.DB_PORT ?? 3306),
  user:     process.env.DB_USER     ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME     ?? 'moti',
});

const users = [
  { username: 'admin', nickname: '관리자', password: 'admin' },
  { username: 'demo',  nickname: '예비 사용자', password: 'demo1234' },
];

for (const u of users) {
  const hash = await bcrypt.hash(u.password, 10);
  await pool.query(
    `INSERT IGNORE INTO users (username, nickname, password_hash) VALUES (?, ?, ?)`,
    [u.username, u.nickname, hash],
  );
  console.log(`✓ ${u.username}`);
}

await pool.end();
console.log('Seed complete.');
