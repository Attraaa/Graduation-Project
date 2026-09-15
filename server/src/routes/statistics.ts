import { Router } from 'express';
import type { Pool } from 'mysql2/promise';
import type { Auth } from '../auth.js';
import type { RowDataPacket } from 'mysql2';
import { asyncHandler } from '../http.js';
import { dateParam, numericParam } from '../validation.js';
import { averageSessionScore, type ScoredSessions } from '../services/statistics.js';

interface DailyStatRow extends RowDataPacket, ScoredSessions {
  mode: string;
  total_monitoring_seconds: number;
}

interface SessionRow extends RowDataPacket {
  score: number | null;
  period: 'today' | 'yesterday';
}

export function createStatisticsRouter(pool: Pool, auth: Auth) {
  const router = Router();
  router.use(auth.requireAuth);

  router.get('/today', asyncHandler(async (req, res) => {
    const [rows] = await pool.query<DailyStatRow[]>(
      `SELECT mode, average_score, session_count, total_monitoring_seconds
       FROM daily_statistics WHERE user_id = ? AND record_date = CURDATE()`,
      [req.user!.userId],
    );
    const totalSeconds = rows.reduce((sum, row) => sum + row.total_monitoring_seconds, 0);
    const sessionCount = rows.reduce((sum, row) => sum + row.session_count, 0);
    const averageScore = averageSessionScore(rows);
    res.json({ averageScore, sessionCount, totalSeconds, byMode: rows });
  }));

  router.get('/trend', asyncHandler(async (req, res) => {
    const date = dateParam(req.query.date);
    // Legacy graph contract: this is an average of measured_value, not a calibrated posture score.
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT DATE_FORMAT(recorded_at, '%H:00') AS time, ROUND(AVG(measured_value)) AS score
       FROM posture_logs
       WHERE user_id = ? AND DATE(recorded_at) = COALESCE(?, CURDATE())
       GROUP BY DATE_FORMAT(recorded_at, '%H:00') ORDER BY MIN(recorded_at)`,
      [req.user!.userId, date ?? null],
    );
    res.json(rows);
  }));

  router.get('/calendar', asyncHandler(async (req, res) => {
    const year = numericParam(req.query.year, 'year', 1000, 9999);
    const month = numericParam(req.query.month, 'month', 1, 12);
    const [rows] = await pool.query<(RowDataPacket & ScoredSessions & { date: string })[]>(
      `SELECT DATE_FORMAT(record_date, '%Y-%m-%d') AS date, session_count, average_score
       FROM daily_statistics
       WHERE user_id = ? AND YEAR(record_date) = ? AND MONTH(record_date) = ?
       ORDER BY record_date`,
      [req.user!.userId, year, month],
    );
    const days = new Map<string, ScoredSessions[]>();
    for (const row of rows) {
      const day = days.get(row.date) ?? [];
      day.push(row);
      days.set(row.date, day);
    }
    res.json(Array.from(days, ([date, day]) => ({
      date,
      session_count: day.reduce((sum, row) => sum + row.session_count, 0),
      avg_score: averageSessionScore(day),
    })));
  }));

  router.get('/improvement', asyncHandler(async (req, res) => {
    // Classify days in SQL, using the same DB clock as session creation and daily aggregation.
    const [rows] = await pool.query<SessionRow[]>(
      `SELECT score, CASE WHEN DATE(started_at) = CURDATE() THEN 'today' ELSE 'yesterday' END AS period
       FROM sessions
       WHERE user_id = ? AND ended_at IS NOT NULL
         AND DATE(started_at) BETWEEN DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND CURDATE()
       ORDER BY started_at`,
      [req.user!.userId],
    );
    const average = (period: SessionRow['period']) => {
      const list = rows.filter((row) => row.period === period && row.score !== null);
      return list.length ? list.reduce((sum, row) => sum + row.score!, 0) / list.length : null;
    };
    const todayAvg = average('today');
    const yesterdayAvg = average('yesterday');
    const improvement = todayAvg !== null && yesterdayAvg !== null && yesterdayAvg !== 0
      ? Math.round(((todayAvg - yesterdayAvg) / yesterdayAvg) * 100)
      : null;
    res.json({ todayAvg, yesterdayAvg, improvement });
  }));

  return router;
}
