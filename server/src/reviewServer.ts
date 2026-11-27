/** Run only the review route behind an existing reverse proxy during independent deployments. */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createAuth } from './auth.js';
import { readConfig } from './config.js';
import { handleError } from './http.js';
import { createAiRouter } from './routes/ai.js';
import { createMiniPcReviewer } from './services/aiReview.js';

const config = readConfig(process.env);
const app = express();
app.use(cors(), express.json({ limit: '16kb' }));
app.use('/api/ai', createAiRouter(config.reviewGatewayUrl ? createMiniPcReviewer(config.reviewGatewayUrl) : null, createAuth(config.jwt)));
app.use(handleError);
const server = app.listen(config.port, '127.0.0.1');
process.once('SIGTERM', () => server.close());
