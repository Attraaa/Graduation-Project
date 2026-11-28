/** Run only the review route behind an existing reverse proxy during independent deployments. */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { readConfig } from './config.js';
import { createDatabase, createDatabaseAuth } from './db.js';
import { handleError } from './http.js';
import { createAiRouter } from './routes/ai.js';
import { createMiniPcReviewer } from './services/aiReview.js';
import { mysqlRequestLimits } from './services/requestLimits.js';

const config = readConfig(process.env);
const app = express();
const pool = createDatabase(config.database);
app.use(cors());
app.use('/api/ai', createAiRouter(config.reviewGatewayUrl ? createMiniPcReviewer(config.reviewGatewayUrl) : null,
  createDatabaseAuth(config.jwt, pool), mysqlRequestLimits(pool)));
app.use(handleError);
const server = app.listen(config.port, '127.0.0.1');
process.once('SIGTERM', () => server.close(() => { void pool.end(); }));
