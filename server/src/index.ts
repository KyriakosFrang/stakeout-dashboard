import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { getDb, closeDb } from './db';
import { addClient, startPoller, stopPoller } from './sse';
import runsRouter from './routes/runs';
import statsRouter from './routes/stats';
import graphsRouter from './routes/graphs';

const PORT = parseInt(process.env.PORT || '3001', 10);

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

// SSE stream — clients subscribe here for live run updates
app.get('/api/stream', (req, res) => {
  const id = randomUUID();
  addClient(id, res);
});

// API routes
app.use('/api/runs', runsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/graphs', graphsRouter);

async function main() {
  await getDb(); // warm up connection
  startPoller();

  const server = app.listen(PORT, () => {
    console.log(`Stakeout Dashboard API running on http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    stopPoller();
    server.close();
    await closeDb();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
