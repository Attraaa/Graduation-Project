import 'dotenv/config';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { createDatabase } from './db.js';

const config = readConfig(process.env);
const pool = createDatabase(config.database);
const server = createApp(config, pool).listen(config.port, () => {
  console.log(`Moti server running on http://localhost:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => { void pool.end().catch(console.error); });
  });
}
