import { Router, Request, Response } from 'express';
import { getDb } from '../db';

const router = Router();

// GET /api/threads — all threads with aggregated metadata
router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const threads = await db
      .collection('runs')
      .aggregate([
        {
          $group: {
            _id: '$thread_id',
            run_count: { $sum: 1 },
            first_run: { $min: '$started_at' },
            last_run: { $max: '$started_at' },
            total_cost: { $sum: '$estimated_cost_usd' },
            total_input_tokens: { $sum: '$total_input_tokens' },
            total_output_tokens: { $sum: '$total_output_tokens' },
            statuses: { $addToSet: '$status' },
            graph_ids: { $addToSet: '$graph_id' },
          },
        },
        { $sort: { last_run: -1 } },
      ])
      .toArray();
    res.json(threads);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch threads' });
  }
});

// GET /api/threads/:thread_id/runs — all runs in a thread with their events
router.get('/:thread_id/runs', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { thread_id } = req.params;

    const runs = await db
      .collection('runs')
      .find({ thread_id })
      .sort({ started_at: 1 })
      .toArray();

    if (runs.length === 0) {
      return res.json([]);
    }

    const runIds = runs.map((r) => r._id as unknown as string);
    const events = await db
      .collection('events')
      .find({ run_id: { $in: runIds } })
      .sort({ timestamp: 1 })
      .toArray();

    const eventsByRun = events.reduce<Record<string, unknown[]>>((acc, ev) => {
      const key = ev.run_id as unknown as string;
      if (!acc[key]) acc[key] = [];
      acc[key].push(ev);
      return acc;
    }, {});

    const result = runs.map((run) => ({
      ...run,
      events: eventsByRun[run._id as unknown as string] ?? [],
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch thread runs' });
  }
});

export default router;
