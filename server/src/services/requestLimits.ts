import { createHash, randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { HttpError } from '../http.js';

type Rule = { key: string; max: number; seconds: number };
export interface RequestLimits {
  reserve(rules: Rule[]): Promise<number>;
  lease(prefix: string, capacity: number, seconds: number): Promise<(() => Promise<void>) | null>;
}

export const limit = (key: string, max: number, seconds: number): Rule => ({ key, max, seconds });

export async function enforce(limits: RequestLimits, rules: Rule[], message: string) {
  const wait = await limits.reserve(rules);
  if (wait > 0) throw new HttpError(429, message, wait);
}

const expires = (seconds: number, now: number) => (Math.floor(now / seconds) + 1) * seconds;

/** Shared SQL windows and expiring leases work across restarts and concurrent API processes. */
export function mysqlRequestLimits(pool: Pool): RequestLimits {
  let lastPrune = 0;
  return {
    async reserve(rules) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [[clock]] = await connection.query<RowDataPacket[]>('SELECT UNIX_TIMESTAMP() AS epoch');
        const now = Number(clock.epoch);
        const buckets = rules.map(rule => {
          const end = expires(rule.seconds, now);
          const key = createHash('sha256').update(JSON.stringify([rule.key, rule.seconds, end])).digest();
          return { ...rule, end, key };
        }).sort((a, b) => Buffer.compare(a.key, b.key));
        let wait = 0;
        for (const bucket of buckets) {
          await connection.query('INSERT INTO request_limits (bucket_id, expires_at) VALUES (?, ?) ON DUPLICATE KEY UPDATE hits = hits', [bucket.key, bucket.end]);
          const [[row]] = await connection.query<RowDataPacket[]>('SELECT hits FROM request_limits WHERE bucket_id = ? FOR UPDATE', [bucket.key]);
          if (Number(row.hits) >= bucket.max) wait = Math.max(wait, bucket.end - now);
        }
        if (wait > 0) {
          // Discard any new buckets created while checking a request that was denied.
          await connection.rollback();
        } else {
          for (const { key } of buckets) await connection.query('UPDATE request_limits SET hits = hits + 1 WHERE bucket_id = ?', [key]);
          await connection.commit();
        }
        if (now - lastPrune >= 60) {
          lastPrune = now;
          void pool.query('DELETE FROM request_limits WHERE expires_at < ? LIMIT 1000', [now]).catch(() => {});
          void pool.query('DELETE FROM request_leases WHERE expires_at < ? LIMIT 1000', [now]).catch(() => {});
        }
        return wait;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async lease(prefix, capacity, seconds) {
      const holder = randomUUID();
      for (let index = 0; index < capacity; index++) {
        const slot = `${prefix}:${index}`;
        await pool.query(`INSERT INTO request_leases (slot, holder, expires_at) VALUES (?, ?, UNIX_TIMESTAMP() + ?) AS next
          ON DUPLICATE KEY UPDATE holder = IF(request_leases.expires_at <= UNIX_TIMESTAMP(), next.holder, request_leases.holder),
          expires_at = IF(request_leases.expires_at <= UNIX_TIMESTAMP(), next.expires_at, request_leases.expires_at)`, [slot, holder, seconds]);
        const [[row]] = await pool.query<RowDataPacket[]>('SELECT holder FROM request_leases WHERE slot = ?', [slot]);
        if (row?.holder === holder) return async () => { await pool.query('DELETE FROM request_leases WHERE slot = ? AND holder = ?', [slot, holder]); };
      }
      return null;
    },
  };
}

/** Isolated route tests can share the same in-memory window across test app instances. */
export function memoryRequestLimits(clock = () => Math.floor(Date.now() / 1000)): RequestLimits {
  const windows = new Map<string, { end: number; hits: number }>();
  const leases = new Map<string, number>();
  return {
    async reserve(rules) {
      const now = clock();
      for (const [key, window] of windows) if (window.end <= now) windows.delete(key);
      const buckets = rules.map(rule => ({ rule, window: windows.get(rule.key) ?? { end: expires(rule.seconds, now), hits: 0 } }));
      const wait = Math.max(0, ...buckets.filter(({ rule, window }) => window.hits >= rule.max).map(({ window }) => window.end - now));
      if (!wait) for (const { rule, window } of buckets) windows.set(rule.key, { ...window, hits: window.hits + 1 });
      return wait;
    },
    async lease(prefix, capacity, seconds) {
      const now = clock(), expires = now + seconds;
      for (let index = 0; index < capacity; index++) {
        const slot = `${prefix}:${index}`;
        if ((leases.get(slot) ?? 0) > now) continue;
        leases.set(slot, expires);
        return async () => { if (leases.get(slot) === expires) leases.delete(slot); };
      }
      return null;
    },
  };
}
