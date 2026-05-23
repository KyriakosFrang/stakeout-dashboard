import { Router, Request, Response } from 'express';
import { getAdapter } from '../adapters';

const router = Router();

// GET /api/runs — paginated + filtered list
router.get('/', async (req: Request, res: Response) => {
  try {
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

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const { runs, total } = await getAdapter().getRuns({
      filter: { graph_id, status, date_from, date_to },
      skip,
      limit: limitNum,
      sort,
      order: order === 'asc' ? 'asc' : 'desc',
    });

    res.json({ runs, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch runs' });
  }
});

// GET /api/runs/:id — single run
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const run = await getAdapter().getRun(req.params.id);
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
    const events = await getAdapter().getRunEvents(req.params.id);
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

export default router;
