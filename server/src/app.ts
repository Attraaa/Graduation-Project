import express from 'express';
import cors from 'cors';
import authRouter      from './routes/auth.js';
import sessionsRouter  from './routes/sessions.js';
import statisticsRouter from './routes/statistics.js';

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api/auth',       authRouter);
app.use('/api/sessions',   sessionsRouter);
app.use('/api/statistics', statisticsRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: '서버 오류가 발생했습니다.' });
});

export default app;
