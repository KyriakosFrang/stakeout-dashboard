import { Response } from 'express';
import { getAdapter } from './adapters';

interface SSEClient {
  id: string;
  res: Response;
}

const clients = new Map<string, SSEClient>();
let pollInterval: NodeJS.Timeout | null = null;
let lastPollTime = new Date(Date.now() - 10_000);

export function addClient(id: string, res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  res.write('event: connected\ndata: {}\n\n');

  clients.set(id, { id, res });

  res.on('close', () => {
    clients.delete(id);
  });
}

export function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients.values()) {
    try {
      client.res.write(payload);
    } catch {
      clients.delete(client.id);
    }
  }
}

export async function startPoller(): Promise<void> {
  if (pollInterval) return;

  pollInterval = setInterval(async () => {
    if (clients.size === 0) return;

    try {
      const since = lastPollTime;
      const now = new Date();

      const updatedRuns = await getAdapter().getRecentlyUpdatedRuns(since, 20);

      if (updatedRuns.length > 0) {
        broadcast('runs_updated', updatedRuns);
      }

      lastPollTime = now;
    } catch (err) {
      console.error('SSE poller error:', err);
    }
  }, 2000);
}

export function stopPoller(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}
