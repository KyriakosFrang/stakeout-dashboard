import express from 'express';
import cors from 'cors';
import path from 'path';
import { randomUUID } from 'crypto';
import { initAdapter, closeAdapter } from './adapters';
import { addClient, startPoller, stopPoller } from './sse';
import { createAuthMiddleware } from './middleware/auth';
import runsRouter from './routes/runs';
import statsRouter from './routes/stats';
import graphsRouter from './routes/graphs';
import threadsRouter from './routes/threads';

const PORT = parseInt(process.env.PORT || '3001', 10);
const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();

app.use(cors());
app.use(express.json());

// Health check — intentionally unauthenticated for container probes
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Apply auth middleware to all subsequent routes
app.use(createAuthMiddleware());

// SSE stream
app.get('/api/stream', (req, res) => {
  const id = randomUUID();
  addClient(id, res);
});

// API routes
app.use('/api/runs', runsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/graphs', graphsRouter);
app.use('/api/threads', threadsRouter);

// Serve built React client in production
if (IS_PROD) {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

async function main() {
  await initAdapter();
  startPoller();

  const server = app.listen(PORT, () => {
    const backend = (process.env.STAKEOUT_BACKEND || 'mongo').toLowerCase();
    console.log(`Stakeout Dashboard API running on http://localhost:${PORT} (backend: ${backend})`);
  });

  const shutdown = async () => {
    stopPoller();
    server.close();
    await closeAdapter();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
