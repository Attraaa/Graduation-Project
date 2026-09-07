import type { Pool, PoolConnection } from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { Session, SessionEnd, SessionLog, SessionMode, SessionRepository, SessionTransaction } from '../services/sessions.js';

interface SessionRow extends RowDataPacket, Session {
  mode: SessionMode;
  score: number | null;
  alert_count: number;
  started_at: Date;
}

class MysqlSessionTransaction implements SessionTransaction {
  constructor(private readonly connection: PoolConnection) {}

  async findOwnedForUpdate(id: number, userId: number): Promise<Session | null> {
    const [rows] = await this.connection.query<SessionRow[]>(
      'SELECT id, user_id, ended_at FROM sessions WHERE id = ? AND user_id = ? FOR UPDATE', [id, userId],
    );
    return rows[0] ?? null;
  }

  async finish(id: number, result: SessionEnd): Promise<void> {
    await this.connection.query(
      'UPDATE sessions SET ended_at = NOW(), score = ?, alert_count = ? WHERE id = ?',
      [result.score, result.alertCount, id],
    );
  }

  async aggregate(id: number, userId: number): Promise<void> {
    // Use the persisted end/result on this connection, in the same transaction as finish().
    await this.connection.query(
      `INSERT INTO daily_statistics (user_id, record_date, mode, total_monitoring_seconds, average_score, session_count)
       SELECT user_id, DATE(started_at), mode,
              GREATEST(0, TIMESTAMPDIFF(SECOND, started_at, ended_at)), score, 1
       FROM sessions WHERE id = ? AND user_id = ?
       ON DUPLICATE KEY UPDATE
         total_monitoring_seconds = total_monitoring_seconds + VALUES(total_monitoring_seconds),
         average_score = (average_score * session_count + VALUES(average_score)) / (session_count + 1),
         session_count = session_count + 1`,
      [id, userId],
    );
  }

  async appendLog(id: number, userId: number, log: SessionLog): Promise<void> {
    await this.connection.query(
      'INSERT INTO posture_logs (session_id, user_id, status, measured_value) VALUES (?, ?, ?, ?)',
      [id, userId, log.status, log.measuredValue],
    );
  }
}

export class MysqlSessionRepository implements SessionRepository {
  constructor(private readonly pool: Pool) {}

  async transaction<T>(work: (transaction: SessionTransaction) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(new MysqlSessionTransaction(connection));
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async start(userId: number, mode: SessionMode) {
    const [result] = await this.pool.query<ResultSetHeader>(
      'INSERT INTO sessions (user_id, mode) VALUES (?, ?)', [userId, mode],
    );
    return { id: result.insertId, mode, startedAt: new Date().toISOString() };
  }

  async list(userId: number, date?: string) {
    const [rows] = date
      ? await this.pool.query<SessionRow[]>(
        'SELECT * FROM sessions WHERE user_id = ? AND DATE(started_at) = ? ORDER BY started_at DESC', [userId, date],
      )
      : await this.pool.query<SessionRow[]>(
        'SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 50', [userId],
      );
    return rows;
  }

  async detail(userId: number, id: number) {
    const [sessions] = await this.pool.query<SessionRow[]>(
      'SELECT * FROM sessions WHERE id = ? AND user_id = ?', [id, userId],
    );
    if (!sessions[0]) return null;
    // Legacy response name: measured_value has no agreed unit and must not be used as a new posture score.
    const [graph] = await this.pool.query<RowDataPacket[]>(
      `SELECT DATE_FORMAT(recorded_at, '%H:%i') AS time, AVG(measured_value) AS score
       FROM posture_logs WHERE session_id = ? AND user_id = ?
       GROUP BY DATE_FORMAT(recorded_at, '%H:%i') ORDER BY MIN(recorded_at)`, [id, userId],
    );
    return { ...sessions[0], graph };
  }
}
