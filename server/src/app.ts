import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import type { Pool } from 'mysql2/promise';
import type { ServerConfig } from './config.js';
import { createAuth } from './auth.js';
import { handleError } from './http.js';
import { createAuthRouter } from './routes/auth.js';
import { createSessionsRouter } from './routes/sessions.js';
import { createStatisticsRouter } from './routes/statistics.js';
import { createFeedbackRouter } from './routes/feedback.js';
import { createRecordsRouter } from './routes/records.js';
import { createAiRouter } from './routes/ai.js';
import { createRecoveryRouter } from './routes/recovery.js';
import { MysqlRecordRepository } from './repositories/records.js';
import { createClaudeReviewer } from './services/aiReview.js';
import { createSmtpMailer } from './services/mail.js';

export function createApp(config: ServerConfig, pool: Pool) {
  const app = express();
  const auth = createAuth(config.jwt);
  app.use(cors({ origin: '*' }));
  // Keyboard batches carry cumulative counts (up to 8000 rows), above the default 100kb body limit.
  app.use('/api/records', express.json({ limit: '2mb' }), createRecordsRouter(new MysqlRecordRepository(pool), auth));
  app.use(express.json());
  app.use('/api/auth', createAuthRouter(pool, auth));
  // Optional: without SMTP settings finding an ID or resetting a password answers 503 and every other route works as before.
  app.use('/api/auth', createRecoveryRouter(pool, config.mail ? createSmtpMailer(config.mail) : null));
  app.use('/api/sessions', createSessionsRouter(pool, auth));
  app.use('/api/statistics', createStatisticsRouter(pool, auth));
  app.use('/api/feedback', createFeedbackRouter(pool, auth));
  // Optional: without ANTHROPIC_API_KEY the AI review answers 503 and every other route works as before.
  const reviewer = config.anthropicApiKey
    ? createClaudeReviewer(new Anthropic({ apiKey: config.anthropicApiKey, timeout: 40_000, maxRetries: 1 }))
    : null;
  app.use('/api/ai', createAiRouter(reviewer, auth));
  // Liveness only: this intentionally does not imply that a DB has been provisioned.
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use(handleError);
  return app;
}
