import { Router, Request, Response } from 'express';
import { getDb } from '../db';

const router = Router();

// GET /api/graphs — distinct graph_ids for filter dropdowns
router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const graphs = await db.collection('runs').distinct('graph_id');
    res.json(graphs.filter(Boolean).sort());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch graphs' });
  }
});

export default router;
