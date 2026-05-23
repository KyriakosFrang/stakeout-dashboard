import { Router, Request, Response } from 'express';
import { getAdapter } from '../adapters';

const router = Router();

// GET /api/graphs — distinct graph_ids for filter dropdowns
router.get('/', async (_req: Request, res: Response) => {
  try {
    const graphs = await getAdapter().getGraphs();
    res.json(graphs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch graphs' });
  }
});

export default router;
