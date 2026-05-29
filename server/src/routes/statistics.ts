import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, type AuthRequest } from '../auth.js';
import type { RowDataPacket } from 'mysql2';

interface DailyStatRow extends RowDataPacket {
  record_date: string;
  mode: string;
  total_monitoring_seconds: number;
  bad_posture_seconds: number;
  average_score: number;
  session_count: number;
}

interface SessionRow extends RowDataPacket {
  score: number;
  started_at: string;
}

const router = Router();
router.use(requireAuth);

// GET /api/statistics/today  — 오늘 요약 (Statistics 화면 카드)
router.get('/today', async (req: AuthRequest, res) => {
  const [rows] = await pool.query<DailyStatRow[]>(
    `SELECT mode, average_score, session_count, total_monitoring_seconds
     FROM daily_statistics
     WHERE user_id = ? AND record_date = CURDATE()`,
    [req.user!.userId],
  );

  if (rows.length === 0) {
    res.json({ averageScore: null, sessionCount: 0, totalSeconds: 0, byMode: [] });
    return;
  }

  const totalSeconds = rows.reduce((s, r) => s + r.total_monitoring_seconds, 0);
  const sessionCount = rows.reduce((s, r) => s + r.session_count, 0);
  const averageScore = Math.round(
    rows.reduce((s, r) => s + r.average_score * r.session_count, 0) / sessionCount,
  );

  res.json({ averageScore, sessionCount, totalSeconds, byMode: rows });
});

// GET /api/statistics/trend  — 시간대별 점수 추이 (꺾은선 그래프)
router.get('/trend', async (req: AuthRequest, res) => {
  const date = (req.query.date as string) ?? new Date().toISOString().slice(0, 10);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DATE_FORMAT(recorded_at, '%H:00') AS time,
            ROUND(AVG(measured_value)) AS score
     FROM posture_logs
     WHERE user_id = ? AND DATE(recorded_at) = ?
     GROUP BY DATE_FORMAT(recorded_at, '%H:00')
     ORDER BY recorded_at`,
    [req.user!.userId, date],
  );
  res.json(rows);
});

// GET /api/statistics/calendar  — 월별 달력 마커 (날짜 → 세션 수)
router.get('/calendar', async (req: AuthRequest, res) => {
  const { year, month } = req.query as { year: string; month: string };
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DATE_FORMAT(record_date, '%Y-%m-%d') AS date,
            SUM(session_count) AS session_count,
            ROUND(AVG(average_score)) AS avg_score
     FROM daily_statistics
     WHERE user_id = ?
       AND YEAR(record_date) = ? AND MONTH(record_date) = ?
     GROUP BY record_date`,
    [req.user!.userId, year, month],
  );
  res.json(rows);
});

// GET /api/statistics/improvement  — 어제 대비 개선도 (%)
router.get('/improvement', async (req: AuthRequest, res) => {
  const [rows] = await pool.query<SessionRow[]>(
    `SELECT score, DATE(started_at) AS day
     FROM sessions
     WHERE user_id = ? AND ended_at IS NOT NULL
       AND DATE(started_at) >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
     ORDER BY started_at`,
    [req.user!.userId],
  );

  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const avg = (day: string) => {
    const list = rows.filter((r) => (r as unknown as { day: string }).day === day);
    return list.length ? list.reduce((s, r) => s + r.score, 0) / list.length : null;
  };

  const todayAvg = avg(today);
  const yestAvg  = avg(yesterday);
  const improvement = todayAvg !== null && yestAvg !== null && yestAvg !== 0
    ? Math.round(((todayAvg - yestAvg) / yestAvg) * 100)
    : null;

  res.json({ todayAvg, yesterdayAvg: yestAvg, improvement });
});

export default router;
