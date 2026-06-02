import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, type AuthRequest } from '../auth.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

interface SessionRow extends RowDataPacket {
  id: number;
  user_id: number;
  mode: string;
  score: number;
  alert_count: number;
  started_at: string;
  ended_at: string | null;
}

const router = Router();
router.use(requireAuth);

// POST /api/sessions  — 세션 시작
router.post('/', async (req: AuthRequest, res) => {
  const { mode } = req.body as { mode: string };
  if (!mode) { res.status(400).json({ message: 'mode가 필요합니다.' }); return; }

  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO sessions (user_id, mode) VALUES (?, ?)',
    [req.user!.userId, mode],
  );
  res.status(201).json({ id: result.insertId, mode, startedAt: new Date().toISOString() });
});

// PATCH /api/sessions/:id/end  — 세션 종료
router.patch('/:id/end', async (req: AuthRequest, res) => {
  const { score, alertCount } = req.body as { score: number; alertCount: number };
  const sessionId = Number(req.params.id);

  const [rows] = await pool.query<SessionRow[]>(
    'SELECT id FROM sessions WHERE id = ? AND user_id = ?',
    [sessionId, req.user!.userId],
  );
  if (!rows[0]) { res.status(404).json({ message: '세션을 찾을 수 없습니다.' }); return; }

  await pool.query(
    'UPDATE sessions SET ended_at = NOW(), score = ?, alert_count = ? WHERE id = ?',
    [score ?? 100, alertCount ?? 0, sessionId],
  );

  // 일일 통계 upsert
  await pool.query(
    `INSERT INTO daily_statistics (user_id, record_date, mode, total_monitoring_seconds, average_score, session_count)
     SELECT ?, DATE(started_at), mode,
            TIMESTAMPDIFF(SECOND, started_at, NOW()),
            ?, 1
     FROM sessions WHERE id = ?
     ON DUPLICATE KEY UPDATE
       total_monitoring_seconds = total_monitoring_seconds + VALUES(total_monitoring_seconds),
       average_score = (average_score * session_count + VALUES(average_score)) / (session_count + 1),
       session_count = session_count + 1`,
    [req.user!.userId, score ?? 100, sessionId],
  );

  res.json({ message: '세션이 종료되었습니다.' });
});

// GET /api/sessions?date=YYYY-MM-DD  — 날짜별 세션 목록
router.get('/', async (req: AuthRequest, res) => {
  const date = req.query.date as string | undefined;
  if (date) {
    const [rows] = await pool.query<SessionRow[]>(
      'SELECT * FROM sessions WHERE user_id = ? AND DATE(started_at) = ? ORDER BY started_at DESC',
      [req.user!.userId, date],
    );
    res.json(rows);
  } else {
    const [rows] = await pool.query<SessionRow[]>(
      'SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 50',
      [req.user!.userId],
    );
    res.json(rows);
  }
});

// GET /api/sessions/:id  — 단일 세션 상세 + 로그 그래프
router.get('/:id', async (req: AuthRequest, res) => {
  const [sessions] = await pool.query<SessionRow[]>(
    'SELECT * FROM sessions WHERE id = ? AND user_id = ?',
    [req.params.id, req.user!.userId],
  );
  if (!sessions[0]) { res.status(404).json({ message: '세션을 찾을 수 없습니다.' }); return; }

  interface LogRow extends RowDataPacket {
    recorded_at: string;
    status: string;
    measured_value: number | null;
  }
  const [logs] = await pool.query<LogRow[]>(
    `SELECT DATE_FORMAT(recorded_at, '%H:%i') AS time,
            AVG(measured_value) AS score
     FROM posture_logs
     WHERE session_id = ?
     GROUP BY DATE_FORMAT(recorded_at, '%H:%i')
     ORDER BY recorded_at`,
    [req.params.id],
  );

  res.json({ ...sessions[0], graph: logs });
});

// POST /api/sessions/:id/logs  — 자세 로그 기록
router.post('/:id/logs', async (req: AuthRequest, res) => {
  const { status, measuredValue } = req.body as { status: string; measuredValue?: number };
  await pool.query(
    'INSERT INTO posture_logs (session_id, user_id, status, measured_value) VALUES (?, ?, ?, ?)',
    [req.params.id, req.user!.userId, status, measuredValue ?? null],
  );
  res.status(201).json({ message: 'ok' });
});

export default router;
