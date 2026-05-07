import { Router, Request, Response } from 'express';
import { getDb } from '../db';

const router = Router();

// GET /api/stats — aggregate overview stats
router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const now = new Date();
    const h24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const d7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [summary24h, activeRuns, dailyCost] = await Promise.all([
      // 24h summary
      db
        .collection('runs')
        .aggregate([
          { $match: { started_at: { $gte: h24Ago } } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
              failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
              running: { $sum: { $cond: [{ $eq: ['$status', 'running'] }, 1, 0] } },
              total_cost: { $sum: { $ifNull: ['$estimated_cost_usd', 0] } },
              total_input_tokens: { $sum: { $ifNull: ['$total_input_tokens', 0] } },
              total_output_tokens: { $sum: { $ifNull: ['$total_output_tokens', 0] } },
            },
          },
        ])
        .toArray(),

      // Currently active runs
      db.collection('runs').countDocuments({ status: 'running' }),

      // Daily cost for the last 7 days
      db
        .collection('runs')
        .aggregate([
          {
            $match: {
              started_at: { $gte: d7Ago },
              estimated_cost_usd: { $exists: true, $ne: null },
            },
          },
          {
            $group: {
              _id: { $substr: ['$started_at', 0, 10] },
              cost: { $sum: '$estimated_cost_usd' },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
    ]);

    // Average duration for completed runs (24h)
    const avgDuration = await db
      .collection('runs')
      .aggregate([
        {
          $match: {
            started_at: { $gte: h24Ago },
            status: 'completed',
            ended_at: { $ne: null },
          },
        },
        {
          $addFields: {
            duration_ms: {
              $subtract: [
                { $toDate: '$ended_at' },
                { $toDate: '$started_at' },
              ],
            },
          },
        },
        { $group: { _id: null, avg_ms: { $avg: '$duration_ms' } } },
      ])
      .toArray();

    const s = summary24h[0] ?? {
      total: 0,
      completed: 0,
      failed: 0,
      running: 0,
      total_cost: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
    };

    res.json({
      total_runs_24h: s.total,
      completed_24h: s.completed,
      failed_24h: s.failed,
      running_24h: s.running,
      active_runs: activeRuns,
      success_rate_24h: s.total > 0 ? (s.completed / s.total) * 100 : null,
      total_cost_24h: s.total_cost,
      total_input_tokens_24h: s.total_input_tokens,
      total_output_tokens_24h: s.total_output_tokens,
      avg_duration_ms: avgDuration[0]?.avg_ms ?? null,
      daily_cost: dailyCost.map((d) => ({ date: d._id, cost: d.cost, count: d.count })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/stats/cost — detailed cost breakdown
router.get('/cost', async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { period = '30d' } = req.query as Record<string, string>;

    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [byModel, byGraph, byDay, topRuns] = await Promise.all([
      // Cost by model
      db
        .collection('events')
        .aggregate([
          {
            $match: {
              timestamp: { $gte: since },
              model: { $exists: true, $ne: null },
              event_type: 'node_end',
            },
          },
          {
            $group: {
              _id: '$model',
              input_tokens: { $sum: { $ifNull: ['$input_tokens', 0] } },
              output_tokens: { $sum: { $ifNull: ['$output_tokens', 0] } },
              call_count: { $sum: 1 },
            },
          },
          { $sort: { input_tokens: -1 } },
        ])
        .toArray(),

      // Cost by graph
      db
        .collection('runs')
        .aggregate([
          {
            $match: {
              started_at: { $gte: since },
              estimated_cost_usd: { $exists: true, $ne: null },
            },
          },
          {
            $group: {
              _id: '$graph_id',
              total_cost: { $sum: '$estimated_cost_usd' },
              run_count: { $sum: 1 },
              avg_cost: { $avg: '$estimated_cost_usd' },
            },
          },
          { $sort: { total_cost: -1 } },
        ])
        .toArray(),

      // Daily cost
      db
        .collection('runs')
        .aggregate([
          {
            $match: {
              started_at: { $gte: since },
              estimated_cost_usd: { $exists: true, $ne: null },
            },
          },
          {
            $group: {
              _id: { $substr: ['$started_at', 0, 10] },
              cost: { $sum: '$estimated_cost_usd' },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray(),

      // Top 10 most expensive runs
      db
        .collection('runs')
        .find({
          started_at: { $gte: since },
          estimated_cost_usd: { $exists: true, $ne: null },
        })
        .sort({ estimated_cost_usd: -1 })
        .limit(10)
        .toArray(),
    ]);

    res.json({
      period,
      by_model: byModel.map((m) => ({
        model: m._id,
        input_tokens: m.input_tokens,
        output_tokens: m.output_tokens,
        call_count: m.call_count,
      })),
      by_graph: byGraph.map((g) => ({
        graph_id: g._id,
        total_cost: g.total_cost,
        run_count: g.run_count,
        avg_cost: g.avg_cost,
      })),
      by_day: byDay.map((d) => ({ date: d._id, cost: d.cost, count: d.count })),
      top_runs: topRuns,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch cost stats' });
  }
});

export default router;
