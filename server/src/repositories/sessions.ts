import type { Pool, PoolConnection } from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type {
  CalibrationReference, KeystrokeEvent, Session, SessionEnd, SessionLog, SessionMode,
  SessionRepository, SessionTransaction,
} from '../services/sessions.js';

interface SessionRow extends RowDataPacket, Session {
  mode: SessionMode;
  score: number | null;
  alert_count: number;
  started_at: Date;
}

const isDuplicateEntry = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY';

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
    // Legacy daily totals belong to the session start date, including sessions crossing midnight.
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

  /**
   * elapsedMs가 있는 행은 세션 시작 시각에 더해 기록 시각을 만듭니다. elapsedMs는 클라이언트의
   * 시계 값이 아니라 구간 길이이므로, 기준이 되는 started_at은 DB가 찍은 시각 그대로 씁니다.
   * 시각을 주지 않은 행은 DB 기본값(NOW())에 맡깁니다. 두 종류를 한 문장에 섞지 않습니다.
   */
  async appendLogs(id: number, userId: number, logs: readonly SessionLog[]): Promise<void> {
    const untimed = logs.filter(log => log.elapsedMs === null);
    if (untimed.length) {
      await this.connection.query(
        'INSERT INTO posture_logs (session_id, user_id, status, metric, measured_value) VALUES ?',
        [untimed.map(log => [id, userId, log.status, log.metric, log.measuredValue])],
      );
    }
    const timed = logs.filter(log => log.elapsedMs !== null);
    if (!timed.length) return;
    const startedAt = await this.startedAt(id);
    await this.connection.query(
      'INSERT INTO posture_logs (session_id, user_id, status, metric, measured_value, recorded_at) VALUES ?',
      [timed.map(log => [
        id, userId, log.status, log.metric, log.measuredValue,
        new Date(startedAt.getTime() + (log.elapsedMs ?? 0)),
      ])],
    );
  }

  async saveCalibration(id: number, userId: number, reference: CalibrationReference): Promise<boolean> {
    try {
      await this.connection.query(
        `INSERT INTO calibration_references
           (session_id, user_id, schema_version, source_id, width_px, height_px,
            sample_count, collected_ms, nose_offset, nose_height, shoulder_diff)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, userId, reference.schemaVersion, reference.sourceId, reference.widthPx, reference.heightPx,
          reference.sampleCount, reference.collectedMs, reference.noseOffset, reference.noseHeight, reference.shoulderDiff,
        ],
      );
      return true;
    } catch (error) {
      // 세션 행 잠금이 같은 세션의 동시 저장을 막지만, 기본키 제약도 같은 경계를 지킵니다.
      if (isDuplicateEntry(error)) return false;
      throw error;
    }
  }

  async appendKeystrokes(id: number, userId: number, events: readonly KeystrokeEvent[]): Promise<void> {
    const columns = 'session_id, user_id, key_code, observed_finger, verdict, reason, confidence, frame_delta_ms, policy_id, policy_version';
    const row = (event: KeystrokeEvent) => [
      id, userId, event.keyCode, event.observedFinger, event.verdict, event.reason,
      event.confidence, event.frameDeltaMs, event.policyId, event.policyVersion,
    ];
    const untimed = events.filter(event => event.elapsedMs === null);
    if (untimed.length) {
      await this.connection.query(`INSERT INTO keystroke_events (${columns}) VALUES ?`, [untimed.map(row)]);
    }
    const timed = events.filter(event => event.elapsedMs !== null);
    if (!timed.length) return;
    const startedAt = await this.startedAt(id);
    await this.connection.query(
      `INSERT INTO keystroke_events (${columns}, recorded_at) VALUES ?`,
      [timed.map(event => [...row(event), new Date(startedAt.getTime() + (event.elapsedMs ?? 0))])],
    );
  }

  private async startedAt(id: number): Promise<Date> {
    const [rows] = await this.connection.query<SessionRow[]>('SELECT started_at FROM sessions WHERE id = ?', [id]);
    const startedAt = rows[0]?.started_at;
    if (!(startedAt instanceof Date)) throw new Error(`Session ${id} has no usable start time.`);
    return startedAt;
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
    // 지표별로 나눕니다. 서로 다른 지표를 한 평균으로 묶으면 의미 없는 값이 나옵니다.
    // 값이 없는 UNAVAILABLE 구간은 AVG가 건너뛰므로 관찰 불가가 점수를 끌어내리지 않습니다.
    const [graph] = await this.pool.query<RowDataPacket[]>(
      `SELECT metric, DATE_FORMAT(MIN(recorded_at), '%H:%i') AS time, AVG(measured_value) AS score
       FROM posture_logs WHERE session_id = ? AND user_id = ? AND metric IS NOT NULL
       GROUP BY metric, DATE_FORMAT(recorded_at, '%Y-%m-%d %H:%i') ORDER BY metric, MIN(recorded_at)`, [id, userId],
    );
    const [calibration] = await this.pool.query<RowDataPacket[]>(
      `SELECT schema_version, source_id, width_px, height_px, sample_count, collected_ms,
              nose_offset, nose_height, shoulder_diff
       FROM calibration_references WHERE session_id = ? AND user_id = ?`, [id, userId],
    );
    // 기준 자세가 없으면 이 세션의 measured_value는 해석할 수 없습니다. 그 사실을 null로 그대로 알립니다.
    return { ...sessions[0], calibration: calibration[0] ?? null, graph };
  }
}
