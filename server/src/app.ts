import express from 'express';
import cors from 'cors';
import type { Pool } from 'mysql2/promise';
import type { ServerConfig } from './config.js';
import { createAuth } from './auth.js';
import { handleError } from './http.js';
import { createAuthRouter } from './routes/auth.js';
import { createSessionsRouter } from './routes/sessions.js';
import { createStatisticsRouter } from './routes/statistics.js';

export function createApp(config: ServerConfig, pool: Pool) {
  const app = express();
  const auth = createAuth(config.jwt);
  app.use(cors({ origin: '*' }));
  app.use(express.json());
  app.use('/api/auth', createAuthRouter(pool, auth));
  app.use('/api/sessions', createSessionsRouter(pool, auth));
  app.use('/api/statistics', createStatisticsRouter(pool, auth));
  // Liveness only: this intentionally does not imply that a DB has been provisioned.
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use(handleError);
  return app;
}
