import { Router, Request, Response } from 'express';
import { getDb } from '../db';

const router = Router();

// GET /api/runs — paginated + filtered list
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const {
      page = '1',
      limit = '50',
      graph_id,
      status,
      date_from,
      date_to,
      sort = 'started_at',
      order = 'desc',
    } = req.query as Record<string, string>;

    const filter: Record<string, unknown> = {};
    if (graph_id) filter.graph_id = graph_id;
    if (status) filter.status = status;
    if (date_from || date_to) {
      filter.started_at = {};
      if (date_from) (filter.started_at as Record<string, Date>).$gte = new Date(date_from);
      if (date_to) (filter.started_at as Record<string, Date>).$lte = new Date(date_to);
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;
    const sortDir = order === 'asc' ? 1 : -1;

    const [runs, total] = await Promise.all([
      db
        .collection('runs')
        .find(filter)
        .sort({ [sort]: sortDir })
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      db.collection('runs').countDocuments(filter),
    ]);

    res.json({ runs, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch runs' });
  }
});

// GET /api/runs/:id — single run
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    // stakeout-agent stores _id as a plain string UUID
    const run = await db.collection('runs').findOne({ _id: req.params.id } as Record<string, string>);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json(run);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch run' });
  }
});

// GET /api/runs/:id/events — all events for a run
router.get('/:id/events', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const events = await db
      .collection('events')
      .find({ run_id: req.params.id })
      .sort({ timestamp: 1 })
      .toArray();
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

export default router;
