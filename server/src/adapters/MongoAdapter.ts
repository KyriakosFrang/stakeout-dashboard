import { MongoClient, Db } from 'mongodb';
import type {
  BackendAdapter,
  RunDoc,
  EventDoc,
  ThreadDoc,
  RunFilters,
  StatsResult,
  CostBreakdownResult,
} from './BackendAdapter';

export class MongoAdapter implements BackendAdapter {
  private client: MongoClient | null = null;
  private db: Db | null = null;

  async connect(): Promise<void> {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
    const dbName = process.env.MONGO_DB || 'stakeout';
    this.client = new MongoClient(uri, { maxPoolSize: 10 });
    await this.client.connect();
    this.db = this.client.db(dbName);
    console.log(`Connected to MongoDB: ${uri}/${dbName}`);
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
  }

  private get _db(): Db {
    if (!this.db) throw new Error('MongoAdapter not connected');
    return this.db;
  }

  async getRuns(params: {
    filter: RunFilters;
    skip: number;
    limit: number;
    sort: string;
    order: 'asc' | 'desc';
  }): Promise<{ runs: RunDoc[]; total: number }> {
    const { filter, skip, limit, sort, order } = params;

    const mongoFilter: Record<string, unknown> = {};
    if (filter.graph_id) mongoFilter.graph_id = filter.graph_id;
    if (filter.status) mongoFilter.status = filter.status;
    if (filter.date_from || filter.date_to) {
      mongoFilter.started_at = {};
      if (filter.date_from) (mongoFilter.started_at as Record<string, Date>).$gte = new Date(filter.date_from);
      if (filter.date_to) (mongoFilter.started_at as Record<string, Date>).$lte = new Date(filter.date_to);
    }

    const sortDir = order === 'asc' ? 1 : -1;
    const [runs, total] = await Promise.all([
      this._db.collection('runs').find(mongoFilter).sort({ [sort]: sortDir }).skip(skip).limit(limit).toArray(),
      this._db.collection('runs').countDocuments(mongoFilter),
    ]);

    return { runs: runs as unknown as RunDoc[], total };
  }

  async getRun(id: string): Promise<RunDoc | null> {
    const run = await this._db.collection('runs').findOne({ _id: id } as Record<string, string>);
    return run ? (run as unknown as RunDoc) : null;
  }

  async getRunEvents(runId: string): Promise<EventDoc[]> {
    const events = await this._db
      .collection('events')
      .find({ run_id: runId })
      .sort({ timestamp: 1 })
      .toArray();
    return events as unknown as EventDoc[];
  }

  async getStats(): Promise<StatsResult> {
    const now = new Date();
    const h24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const d7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [summary24h, activeRuns, dailyCost, avgDuration] = await Promise.all([
      this._db.collection('runs').aggregate([
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
      ]).toArray(),

      this._db.collection('runs').countDocuments({ status: 'running' }),

      this._db.collection('runs').aggregate([
        {
          $match: {
            started_at: { $gte: d7Ago },
            estimated_cost_usd: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$started_at' } },
            cost: { $sum: '$estimated_cost_usd' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]).toArray(),

      this._db.collection('runs').aggregate([
        {
          $match: { started_at: { $gte: h24Ago }, status: 'completed', ended_at: { $ne: null } },
        },
        {
          $addFields: {
            duration_ms: { $subtract: [{ $toDate: '$ended_at' }, { $toDate: '$started_at' }] },
          },
        },
        { $group: { _id: null, avg_ms: { $avg: '$duration_ms' } } },
      ]).toArray(),
    ]);

    const s = summary24h[0] ?? {
      total: 0, completed: 0, failed: 0, running: 0,
      total_cost: 0, total_input_tokens: 0, total_output_tokens: 0,
    };

    return {
      total_runs_24h: s.total as number,
      completed_24h: s.completed as number,
      failed_24h: s.failed as number,
      running_24h: s.running as number,
      active_runs: activeRuns,
      success_rate_24h: (s.total as number) > 0 ? ((s.completed as number) / (s.total as number)) * 100 : null,
      total_cost_24h: s.total_cost as number,
      total_input_tokens_24h: s.total_input_tokens as number,
      total_output_tokens_24h: s.total_output_tokens as number,
      avg_duration_ms: (avgDuration[0] as Record<string, number> | undefined)?.avg_ms ?? null,
      daily_cost: dailyCost.map((d) => ({
        date: d._id as string,
        cost: d.cost as number,
        count: d.count as number,
      })),
    };
  }

  async getCostStats(since: Date, period: string): Promise<CostBreakdownResult> {
    const [byModel, byGraph, byDay, topRuns] = await Promise.all([
      this._db.collection('events').aggregate([
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
      ]).toArray(),

      this._db.collection('runs').aggregate([
        {
          $match: { started_at: { $gte: since }, estimated_cost_usd: { $exists: true, $ne: null } },
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
      ]).toArray(),

      this._db.collection('runs').aggregate([
        {
          $match: { started_at: { $gte: since }, estimated_cost_usd: { $exists: true, $ne: null } },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$started_at' } },
            cost: { $sum: '$estimated_cost_usd' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]).toArray(),

      this._db.collection('runs')
        .find({ started_at: { $gte: since }, estimated_cost_usd: { $exists: true, $ne: null } })
        .sort({ estimated_cost_usd: -1 })
        .limit(10)
        .toArray(),
    ]);

    return {
      period,
      by_model: byModel.map((m) => ({
        model: m._id as string,
        input_tokens: m.input_tokens as number,
        output_tokens: m.output_tokens as number,
        call_count: m.call_count as number,
      })),
      by_graph: byGraph.map((g) => ({
        graph_id: g._id as string,
        total_cost: g.total_cost as number,
        run_count: g.run_count as number,
        avg_cost: g.avg_cost as number,
      })),
      by_day: byDay.map((d) => ({ date: d._id as string, cost: d.cost as number, count: d.count as number })),
      top_runs: topRuns as unknown as RunDoc[],
    };
  }

  async getThreads(): Promise<ThreadDoc[]> {
    const threads = await this._db.collection('runs').aggregate([
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
    ]).toArray();
    return threads as unknown as ThreadDoc[];
  }

  async getThreadRuns(threadId: string): Promise<Array<RunDoc & { events: EventDoc[] }>> {
    const runs = await this._db
      .collection('runs')
      .find({ thread_id: threadId })
      .sort({ started_at: 1 })
      .toArray();

    if (runs.length === 0) return [];

    const runIds = runs.map((r) => r._id as unknown as string);
    const events = await this._db
      .collection('events')
      .find({ run_id: { $in: runIds } })
      .sort({ timestamp: 1 })
      .toArray();

    const eventsByRun = events.reduce<Record<string, EventDoc[]>>((acc, ev) => {
      const key = ev.run_id as unknown as string;
      if (!acc[key]) acc[key] = [];
      acc[key].push(ev as unknown as EventDoc);
      return acc;
    }, {});

    return runs.map((run) => ({
      ...(run as unknown as RunDoc),
      events: eventsByRun[run._id as unknown as string] ?? [],
    }));
  }

  async getGraphs(): Promise<string[]> {
    const graphs = await this._db.collection('runs').distinct('graph_id');
    return (graphs.filter(Boolean) as string[]).sort();
  }

  async getRecentlyUpdatedRuns(since: Date, limit: number): Promise<RunDoc[]> {
    const runs = await this._db.collection('runs').find({
      $or: [{ started_at: { $gte: since } }, { ended_at: { $gte: since } }],
    }).sort({ started_at: -1 }).limit(limit).toArray();
    return runs as unknown as RunDoc[];
  }
}
