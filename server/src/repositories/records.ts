import { createHash } from 'node:crypto';
import type { Pool, PoolConnection } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { HttpError } from '../http.js';
import { localDateKey, parseRecord } from '../../../database/contracts.ts';
import type { MinuteBucket, RecordBatch, RecordDetail, RecordMode, RecordPage, RecordQuery, StatisticsRow, Totals } from '../../../database/contracts.ts';
import { keyboardCountKey, keyboardTotalsSummary, parseKeyboardRecord } from '../../../database/keyboard.ts';
import type { KeyboardBatch, KeyboardCount, KeyboardHistoryRecord, KeyboardQuery, KeyboardStored, KeyboardTotals } from '../../../database/keyboard.ts';
import { eyeFields, parseEyeRecord } from '../../../database/eye.ts';
import type { EyeBatch, EyeBucket, EyeDetail, EyeStatisticsRow, EyeTotals, HistoryPage } from '../../../database/eye.ts';

const fields = ['runMs', 'validMs', 'scoreTimeSum', 'deviationMs', 'deviationEpisodeCount'] as const;
const columns = { runMs: 'run_ms', validMs: 'valid_ms', scoreTimeSum: 'score_time_sum', deviationMs: 'deviation_ms', deviationEpisodeCount: 'deviation_episode_count' } as const;
const closeEnough = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, Math.abs(a) * 1e-10);
const digestOf = (batch: unknown) => createHash('sha256').update(JSON.stringify(batch)).digest('hex');
const conflict = (message: string) => new HttpError(409, message);
// mysql2 returns SUM(INT) as a DECIMAL string, so every numeric column is read through Number().
const totalsOf = (row: RowDataPacket): Totals => Object.fromEntries(fields.map(key => [key, Number(row[columns[key]])])) as unknown as Totals;
const eyeColumns = { runMs: 'run_ms', validMs: 'valid_ms', blinks: 'blinks', breaks: 'breaks', nearReminders: 'near_reminders', openReminders: 'open_reminders' } as const;
const eyeTotalsOf = (row: RowDataPacket): EyeTotals => Object.fromEntries(eyeFields.map(key => [key, Number(row[eyeColumns[key]])])) as EyeTotals;

/**
 * Server port of the former Electron SQLite repository. Inputs are already parsed by the
 * shared database/ contracts; ownership comes from the authenticated user, never the body.
 * Every write locks the owner's generation row first, so one user's writes and deletion serialize.
 */
export class MysqlRecordRepository {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private async lockGeneration(connection: PoolConnection, userId: number) {
    await connection.query('INSERT INTO record_owners (user_id) VALUES (?) ON DUPLICATE KEY UPDATE user_id = user_id', [userId]);
    const [rows] = await connection.query<RowDataPacket[]>('SELECT generation FROM record_owners WHERE user_id = ? FOR UPDATE', [userId]);
    return Number(rows[0].generation);
  }

  async generation(userId: number) {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT generation FROM record_owners WHERE user_id = ?', [userId]);
    return Number(rows[0]?.generation ?? 0);
  }

  async write(userId: number, batch: RecordBatch) {
    const record = batch.record;
    const digest = digestOf(batch);
    await this.transaction(async connection => {
      if (batch.generation !== await this.lockGeneration(connection, userId)) throw conflict('삭제된 기록의 저장 요청입니다. 새 측정을 시작해 주세요.');
      const [previousRows] = await connection.query<RowDataPacket[]>('SELECT user_id, sequence, data FROM posture_records WHERE id = ? FOR UPDATE', [record.id]);
      const previous = previousRows[0];
      if (previous && Number(previous.user_id) !== userId) throw conflict('다른 계정의 기록입니다.');
      const [duplicate] = await connection.query<RowDataPacket[]>('SELECT digest FROM posture_batches WHERE record_id = ? AND sequence = ?', [record.id, batch.sequence]);
      if (duplicate[0]) {
        if (duplicate[0].digest !== digest) throw conflict('같은 순번에 다른 기록이 도착했습니다.');
        return;
      }
      if (batch.sequence !== (previous ? Number(previous.sequence) + 1 : 0)) throw conflict('기록 순서가 일치하지 않습니다.');
      if (previous) {
        const old = parseRecord(JSON.parse(String(previous.data)));
        if (old.status !== 'running') throw conflict('이미 종료된 기록입니다.');
        for (const key of ['mode', 'startedAt', 'offsetMinutes', 'scorePolicyVersion', 'habitPolicyVersion'] as const) {
          if (old[key] !== record[key]) throw conflict('기록의 고정 정보가 변경되었습니다.');
        }
        for (const key of [...fields, 'longestContinuousMs', 'updatedAt'] as const) {
          if (record[key] + 0.01 < old[key]) throw conflict('기록 누적값이 감소했습니다.');
        }
      }
      await connection.query(
        `INSERT INTO posture_records (id, user_id, mode, start_date, started_at, score_policy, habit_policy, longest_ms, sequence, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) AS next
         ON DUPLICATE KEY UPDATE longest_ms = next.longest_ms, sequence = next.sequence, data = next.data`,
        [record.id, userId, record.mode, localDateKey(record.startedAt, record.offsetMinutes), record.startedAt,
          record.scorePolicyVersion, record.habitPolicyVersion, record.longestContinuousMs, batch.sequence, JSON.stringify(record)],
      );
      if (batch.buckets.length) {
        const [oldRows] = await connection.query<RowDataPacket[]>(
          'SELECT * FROM posture_buckets WHERE record_id = ? AND minute IN (?) FOR UPDATE', [record.id, batch.buckets.map(bucket => bucket.minute)],
        );
        const old = new Map(oldRows.map(row => [Number(row.minute), totalsOf(row)]));
        for (const bucket of batch.buckets) {
          const stored = old.get(bucket.minute);
          if (stored && fields.some(key => bucket[key] + 0.01 < stored[key])) throw conflict('시간 버킷 누적값이 감소했습니다.');
        }
        await connection.query(
          `INSERT INTO posture_buckets (record_id, minute, date, hour, ${fields.map(key => columns[key]).join(', ')}) VALUES ? AS next
           ON DUPLICATE KEY UPDATE ${fields.map(key => `${columns[key]} = next.${columns[key]}`).join(', ')}`,
          [batch.buckets.map(bucket => {
            const local = new Date(bucket.minute - record.offsetMinutes * 60_000).toISOString();
            return [record.id, bucket.minute, local.slice(0, 10), local.slice(11, 13), ...fields.map(key => bucket[key])];
          })],
        );
      }
      const [sumRows] = await connection.query<RowDataPacket[]>(
        `SELECT ${fields.map(key => `COALESCE(SUM(${columns[key]}), 0) AS ${columns[key]}`).join(', ')} FROM posture_buckets WHERE record_id = ?`, [record.id],
      );
      const sum = totalsOf(sumRows[0]);
      if (fields.some(key => !closeEnough(sum[key], record[key]))) throw conflict('요약과 시간 버킷의 합계가 일치하지 않습니다.');
      await connection.query('INSERT INTO posture_batches (record_id, sequence, digest) VALUES (?, ?, ?)', [record.id, batch.sequence, digest]);
    });
  }

  async list(userId: number, query: RecordQuery): Promise<RecordPage> {
    const mode = query.mode ?? null;
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT data FROM posture_records WHERE user_id = ? AND start_date BETWEEN ? AND ? AND (? IS NULL OR mode = ?)
       ORDER BY started_at DESC, id LIMIT 101 OFFSET ?`,
      [userId, query.from, query.to, mode, mode, query.offset ?? 0],
    );
    const [counts] = await this.pool.query<RowDataPacket[]>(
      `SELECT start_date, COUNT(*) AS count FROM posture_records WHERE user_id = ? AND start_date BETWEEN ? AND ? AND (? IS NULL OR mode = ?)
       GROUP BY start_date`,
      [userId, query.from, query.to, mode, mode],
    );
    return { records: rows.slice(0, 100).map(row => parseRecord(JSON.parse(String(row.data)))), hasMore: rows.length > 100,
      counts: Object.fromEntries(counts.map(row => [String(row.start_date), Number(row.count)])) };
  }

  async detail(userId: number, id: string): Promise<RecordDetail> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT data FROM posture_records WHERE user_id = ? AND id = ?', [userId, id]);
    if (!rows[0]) throw new HttpError(404, '기록을 찾을 수 없습니다.');
    const [buckets] = await this.pool.query<RowDataPacket[]>('SELECT * FROM posture_buckets WHERE record_id = ? ORDER BY minute', [id]);
    return { record: parseRecord(JSON.parse(String(rows[0].data))),
      buckets: buckets.map(row => ({ minute: Number(row.minute), ...totalsOf(row) }) satisfies MinuteBucket) };
  }

  /** Sums per (date, hour, record) in SQL, then merges records that share a mode and both policies. */
  async statistics(userId: number, query: RecordQuery): Promise<StatisticsRow[]> {
    const mode = query.mode ?? null;
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT b.date, b.hour, r.id, r.mode, r.score_policy, r.habit_policy, r.longest_ms,
              ${fields.map(key => `SUM(b.${columns[key]}) AS ${columns[key]}`).join(', ')}
       FROM posture_buckets b JOIN posture_records r ON r.id = b.record_id
       WHERE r.user_id = ? AND b.date BETWEEN ? AND ? AND (? IS NULL OR r.mode = ?)
       GROUP BY b.date, b.hour, r.id ORDER BY b.date, b.hour, r.id LIMIT 100001`,
      [userId, query.from, query.to, mode, mode],
    );
    const groups = new Map<string, StatisticsRow>();
    for (const row of rows) {
      const key = JSON.stringify([row.date, row.hour, row.mode, row.score_policy, row.habit_policy]);
      const group = groups.get(key) ?? { date: String(row.date), hour: String(row.hour), mode: row.mode as RecordMode,
        scorePolicyVersion: String(row.score_policy), habitPolicyVersion: String(row.habit_policy),
        longestContinuousMs: 0, sessionCount: 0, recordIds: [], runMs: 0, validMs: 0, scoreTimeSum: 0, deviationMs: 0, deviationEpisodeCount: 0 };
      const totals = totalsOf(row);
      for (const field of fields) group[field] += totals[field];
      group.longestContinuousMs = Math.max(group.longestContinuousMs, Number(row.longest_ms));
      group.recordIds.push(String(row.id));
      group.sessionCount = group.recordIds.length;
      groups.set(key, group);
    }
    if (rows.length > 100000 || groups.size > 10000) throw new HttpError(400, '조회 결과가 많습니다. 기간을 줄여 주세요.');
    return [...groups.values()];
  }

  /** Current user only. Incrementing generation also invalidates in-flight batches. */
  async clear(userId: number) {
    return this.transaction(async connection => {
      await this.lockGeneration(connection, userId);
      await connection.query('DELETE FROM posture_records WHERE user_id = ?', [userId]);
      await connection.query('DELETE FROM keyboard_records WHERE user_id = ?', [userId]);
      await connection.query('DELETE FROM eye_records WHERE user_id = ?', [userId]);
      await connection.query('UPDATE record_owners SET generation = generation + 1 WHERE user_id = ?', [userId]);
      const [rows] = await connection.query<RowDataPacket[]>('SELECT generation FROM record_owners WHERE user_id = ?', [userId]);
      return Number(rows[0].generation);
    });
  }

  async writeKeyboard(userId: number, batch: KeyboardBatch) {
    const record = batch.record;
    const digest = digestOf(batch);
    await this.transaction(async connection => {
      if (batch.generation !== await this.lockGeneration(connection, userId)) throw conflict('삭제된 키보드 기록의 저장 요청입니다.');
      const [previousRows] = await connection.query<RowDataPacket[]>('SELECT user_id, sequence, data FROM keyboard_records WHERE id = ? FOR UPDATE', [record.id]);
      const previous = previousRows[0];
      if (previous && Number(previous.user_id) !== userId) throw conflict('다른 계정의 기록입니다.');
      const [duplicate] = await connection.query<RowDataPacket[]>('SELECT digest FROM keyboard_batches WHERE record_id = ? AND sequence = ?', [record.id, batch.sequence]);
      if (duplicate[0]) {
        if (duplicate[0].digest !== digest) throw conflict('같은 순번에 다른 기록이 도착했습니다.');
        return;
      }
      if (batch.sequence !== (previous ? Number(previous.sequence) + 1 : 0)) throw conflict('키보드 기록 순서가 일치하지 않습니다.');
      if (previous) {
        const old = parseKeyboardRecord(JSON.parse(String(previous.data)));
        if (old.status !== 'running') throw conflict('이미 종료된 키보드 기록입니다.');
        for (const field of ['owner', 'startedAt', 'offsetMinutes', 'policyVersion', 'recognitionVersion', 'nearbyCredit'] as const) {
          if (old[field] !== record[field]) throw conflict('키보드 기록의 정책이 변경되었습니다.');
        }
        if (old.total > record.total || old.updatedAt > record.updatedAt) throw conflict('키보드 누적값이 감소했습니다.');
      }
      const [oldCounts] = await connection.query<RowDataPacket[]>('SELECT count_key, data FROM keyboard_counts WHERE record_id = ? FOR UPDATE', [record.id]);
      const nextCounts = new Map(batch.counts.map(row => [keyboardCountKey(row), row]));
      for (const row of oldCounts) {
        if ((nextCounts.get(String(row.count_key))?.count ?? 0) < (JSON.parse(String(row.data)) as KeyboardCount).count) throw conflict('키보드 집계 누적값이 감소했습니다.');
      }
      await connection.query(
        `INSERT INTO keyboard_records (id, user_id, start_date, sequence, data) VALUES (?, ?, ?, ?, ?) AS next
         ON DUPLICATE KEY UPDATE sequence = next.sequence, data = next.data`,
        [record.id, userId, localDateKey(record.startedAt, record.offsetMinutes), batch.sequence, JSON.stringify(record)],
      );
      for (let start = 0; start < batch.counts.length; start += 500) {
        await connection.query(
          'INSERT INTO keyboard_counts (record_id, count_key, date, data) VALUES ? AS next ON DUPLICATE KEY UPDATE data = next.data',
          [batch.counts.slice(start, start + 500).map(row => [record.id, keyboardCountKey(row), row.date, JSON.stringify(row)])],
        );
      }
      await connection.query('INSERT INTO keyboard_batches (record_id, sequence, digest) VALUES (?, ?, ?)', [record.id, batch.sequence, digest]);
    });
  }

  async keyboardStatistics(userId: number, query: KeyboardQuery): Promise<KeyboardStored[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT DISTINCT r.id, r.start_date, r.data FROM keyboard_records r LEFT JOIN keyboard_counts c ON c.record_id = r.id
       WHERE r.user_id = ? AND (c.date BETWEEN ? AND ? OR r.start_date BETWEEN ? AND ?) ORDER BY r.start_date, r.id LIMIT 1001`,
      [userId, query.from, query.to, query.from, query.to],
    );
    if (rows.length > 1000) throw new HttpError(400, '키보드 기록이 많습니다. 조회 기간을 줄여 주세요.');
    if (!rows.length) return [];
    const [counts] = await this.pool.query<RowDataPacket[]>(
      'SELECT record_id, data FROM keyboard_counts WHERE record_id IN (?) AND date BETWEEN ? AND ? ORDER BY record_id, count_key',
      [rows.map(row => row.id), query.from, query.to],
    );
    return rows.map(row => ({ record: parseKeyboardRecord(JSON.parse(String(row.data))),
      counts: counts.filter(count => count.record_id === row.id).map(count => JSON.parse(String(count.data)) as KeyboardCount) }));
  }

  async keyboardDetail(userId: number, id: string): Promise<KeyboardStored> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT data FROM keyboard_records WHERE user_id = ? AND id = ?', [userId, id]);
    if (!rows[0]) throw new HttpError(404, '키보드 기록을 찾을 수 없습니다.');
    const [counts] = await this.pool.query<RowDataPacket[]>('SELECT data FROM keyboard_counts WHERE record_id = ? ORDER BY count_key', [id]);
    return { record: parseKeyboardRecord(JSON.parse(String(rows[0].data))),
      counts: counts.map(count => JSON.parse(String(count.data)) as KeyboardCount) };
  }

  async writeEye(userId: number, batch: EyeBatch) {
    const record = batch.record;
    const digest = digestOf(batch);
    await this.transaction(async connection => {
      if (batch.generation !== await this.lockGeneration(connection, userId)) throw conflict('삭제된 안구 기록의 저장 요청입니다.');
      const [previousRows] = await connection.query<RowDataPacket[]>('SELECT user_id, sequence, data FROM eye_records WHERE id = ? FOR UPDATE', [record.id]);
      const previous = previousRows[0];
      if (previous && Number(previous.user_id) !== userId) throw conflict('다른 계정의 기록입니다.');
      const [duplicate] = await connection.query<RowDataPacket[]>('SELECT digest FROM eye_batches WHERE record_id = ? AND sequence = ?', [record.id, batch.sequence]);
      if (duplicate[0]) {
        if (duplicate[0].digest !== digest) throw conflict('같은 순번에 다른 기록이 도착했습니다.');
        return;
      }
      if (batch.sequence !== (previous ? Number(previous.sequence) + 1 : 0)) throw conflict('안구 기록 순서가 일치하지 않습니다.');
      if (previous) {
        const old = parseEyeRecord(JSON.parse(String(previous.data)));
        if (old.status !== 'running') throw conflict('이미 종료된 안구 기록입니다.');
        for (const key of ['owner', 'startedAt', 'offsetMinutes', 'policyVersion'] as const) {
          if (old[key] !== record[key]) throw conflict('안구 기록의 고정 정보가 변경되었습니다.');
        }
        for (const key of [...eyeFields, 'updatedAt'] as const) {
          if (record[key] + 0.01 < old[key]) throw conflict('안구 기록 누적값이 감소했습니다.');
        }
      }
      await connection.query(
        `INSERT INTO eye_records (id, user_id, start_date, started_at, policy_version, sequence, data)
         VALUES (?, ?, ?, ?, ?, ?, ?) AS next
         ON DUPLICATE KEY UPDATE sequence = next.sequence, data = next.data`,
        [record.id, userId, localDateKey(record.startedAt, record.offsetMinutes), record.startedAt,
          record.policyVersion, batch.sequence, JSON.stringify(record)],
      );
      if (batch.buckets.length) {
        const [oldRows] = await connection.query<RowDataPacket[]>(
          'SELECT * FROM eye_buckets WHERE record_id = ? AND minute IN (?) FOR UPDATE', [record.id, batch.buckets.map(bucket => bucket.minute)],
        );
        const old = new Map(oldRows.map(row => [Number(row.minute), eyeTotalsOf(row)]));
        for (const bucket of batch.buckets) {
          const stored = old.get(bucket.minute);
          if (stored && eyeFields.some(key => bucket[key] + 0.01 < stored[key])) throw conflict('안구 버킷 누적값이 감소했습니다.');
        }
        await connection.query(
          `INSERT INTO eye_buckets (record_id, minute, date, hour, ${eyeFields.map(key => eyeColumns[key]).join(', ')}) VALUES ? AS next
           ON DUPLICATE KEY UPDATE ${eyeFields.map(key => `${eyeColumns[key]} = next.${eyeColumns[key]}`).join(', ')}`,
          [batch.buckets.map(bucket => {
            const local = new Date(bucket.minute - record.offsetMinutes * 60_000).toISOString();
            return [record.id, bucket.minute, local.slice(0, 10), local.slice(11, 13), ...eyeFields.map(key => bucket[key])];
          })],
        );
      }
      const [sumRows] = await connection.query<RowDataPacket[]>(
        `SELECT ${eyeFields.map(key => `COALESCE(SUM(${eyeColumns[key]}), 0) AS ${eyeColumns[key]}`).join(', ')} FROM eye_buckets WHERE record_id = ?`, [record.id],
      );
      const sum = eyeTotalsOf(sumRows[0]);
      if (eyeFields.some(key => !closeEnough(sum[key], record[key]))) throw conflict('안구 요약과 시간 버킷의 합계가 일치하지 않습니다.');
      await connection.query('INSERT INTO eye_batches (record_id, sequence, digest) VALUES (?, ?, ?)', [record.id, batch.sequence, digest]);
    });
  }

  async eyeDetail(userId: number, id: string): Promise<EyeDetail> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT data FROM eye_records WHERE user_id = ? AND id = ?', [userId, id]);
    if (!rows[0]) throw new HttpError(404, '안구 기록을 찾을 수 없습니다.');
    const [buckets] = await this.pool.query<RowDataPacket[]>('SELECT * FROM eye_buckets WHERE record_id = ? ORDER BY minute', [id]);
    return { record: parseEyeRecord(JSON.parse(String(rows[0].data))),
      buckets: buckets.map(row => ({ minute: Number(row.minute), ...eyeTotalsOf(row) }) satisfies EyeBucket) };
  }

  async eyeStatistics(userId: number, query: RecordQuery): Promise<EyeStatisticsRow[]> {
    if (query.mode) throw new HttpError(400, '안구 통계에는 자세 모드 조건을 사용할 수 없습니다.');
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT b.date, b.hour, r.policy_version, COUNT(DISTINCT r.id) AS session_count,
              ${eyeFields.map(key => `SUM(b.${eyeColumns[key]}) AS ${eyeColumns[key]}`).join(', ')}
       FROM eye_buckets b JOIN eye_records r ON r.id = b.record_id
       WHERE r.user_id = ? AND b.date BETWEEN ? AND ?
       GROUP BY b.date, b.hour, r.policy_version ORDER BY b.date, b.hour, r.policy_version LIMIT 10001`,
      [userId, query.from, query.to],
    );
    if (rows.length > 10000) throw new HttpError(400, '안구 기록이 많습니다. 조회 기간을 줄여 주세요.');
    return rows.map(row => ({ date: String(row.date), hour: String(row.hour), policyVersion: String(row.policy_version),
      sessionCount: Number(row.session_count), ...eyeTotalsOf(row) }));
  }

  /** Order all modes together before applying the calendar page limit. */
  async history(userId: number, query: RecordQuery): Promise<HistoryPage> {
    if (query.mode) throw new HttpError(400, '학습이력에는 모드 조건을 사용할 수 없습니다.');
    const source = `(SELECT id, user_id, start_date, started_at, data, mode FROM posture_records
      UNION ALL SELECT id, user_id, start_date, started_at, data, 'eye' AS mode FROM eye_records
      UNION ALL SELECT id, user_id, start_date, CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.startedAt')) AS UNSIGNED) AS started_at,
        data, 'keyboard' AS mode FROM keyboard_records) AS history_records`;
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT data, mode FROM ${source} WHERE user_id = ? AND start_date BETWEEN ? AND ?
       ORDER BY started_at DESC, mode, id LIMIT 101 OFFSET ?`,
      [userId, query.from, query.to, query.offset ?? 0],
    );
    const [counts] = await this.pool.query<RowDataPacket[]>(
      `SELECT start_date, COUNT(*) AS count FROM ${source} WHERE user_id = ? AND start_date BETWEEN ? AND ? GROUP BY start_date`,
      [userId, query.from, query.to],
    );
    const page = rows.slice(0, 100);
    const keyboardIds = page.filter(row => row.mode === 'keyboard').map(row => parseKeyboardRecord(JSON.parse(String(row.data))).id);
    const keyboardTotals = new Map<string, KeyboardTotals>();
    if (keyboardIds.length) {
      const [groups] = await this.pool.query<RowDataPacket[]>(
        `SELECT c.record_id, JSON_UNQUOTE(JSON_EXTRACT(c.data, '$.verdict')) AS verdict,
          JSON_UNQUOTE(JSON_EXTRACT(c.data, '$.reason')) AS reason,
          SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(c.data, '$.count')) AS UNSIGNED)) AS count
         FROM keyboard_counts c JOIN keyboard_records r ON r.id = c.record_id
         WHERE r.user_id = ? AND c.record_id IN (?) GROUP BY c.record_id, verdict, reason`, [userId, keyboardIds],
      );
      for (const group of groups) {
        const id = String(group.record_id);
        const totals = keyboardTotals.get(id) ?? { preferred: 0, acceptable: 0, nearby: 0, mismatch: 0, unknown: 0, unsupported: 0 };
        const field = group.verdict === 'unknown' && (group.reason === 'unsupported-key' || group.reason === 'shortcut') ? 'unsupported' : String(group.verdict);
        if (field in totals) totals[field as keyof KeyboardTotals] += Number(group.count);
        keyboardTotals.set(id, totals);
      }
    }
    return { records: page.map(row => {
      const data: unknown = JSON.parse(String(row.data));
      if (row.mode === 'eye') return parseEyeRecord(data);
      if (row.mode !== 'keyboard') return parseRecord(data);
      const record = parseKeyboardRecord(data);
      const { score, coverage, valid } = keyboardTotalsSummary(keyboardTotals.get(record.id)
        ?? { preferred: 0, acceptable: 0, nearby: 0, mismatch: 0, unknown: 0, unsupported: 0 }, record.nearbyCredit);
      return { ...record, mode: 'keyboard', summary: { score, coverage, valid } } satisfies KeyboardHistoryRecord;
    }),
      hasMore: rows.length > 100, counts: Object.fromEntries(counts.map(row => [String(row.start_date), Number(row.count)])) };
  }
}
