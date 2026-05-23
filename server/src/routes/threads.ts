import { Router, Request, Response } from 'express';
import { getAdapter } from '../adapters';

const router = Router();

// GET /api/threads — all threads with aggregated metadata
router.get('/', async (_req: Request, res: Response) => {
  try {
    const threads = await getAdapter().getThreads();
    res.json(threads);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch threads' });
  }
});

// GET /api/threads/:thread_id/runs — all runs in a thread with their events
router.get('/:thread_id/runs', async (req: Request, res: Response) => {
  try {
    const result = await getAdapter().getThreadRuns(req.params.thread_id);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch thread runs' });
  }
});

export default router;
