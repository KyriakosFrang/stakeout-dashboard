import { Router, Request, Response } from 'express';
import { getAdapter } from '../adapters';

const router = Router();

// GET /api/stats — aggregate overview stats
router.get('/', async (_req: Request, res: Response) => {
  try {
    const stats = await getAdapter().getStats();
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/stats/cost — detailed cost breakdown
router.get('/cost', async (req: Request, res: Response) => {
  try {
    const { period = '30d' } = req.query as Record<string, string>;
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await getAdapter().getCostStats(since, period);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch cost stats' });
  }
});

export default router;
