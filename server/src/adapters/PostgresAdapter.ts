import { Pool, PoolClient } from 'pg';
import type {
  BackendAdapter,
  RunDoc,
  EventDoc,
  ThreadDoc,
  RunFilters,
  StatsResult,
  CostBreakdownResult,
} from './BackendAdapter';

const ALLOWED_SORT_FIELDS = new Set([
  'started_at', 'ended_at', 'estimated_cost_usd', 'status', 'graph_id',
]);

function sanitizeSort(field: string): string {
  return ALLOWED_SORT_FIELDS.has(field) ? field : 'started_at';
}

function rowToRun(row: Record<string, unknown>): RunDoc {
  return { ...row, _id: row._id ?? row.run_id } as unknown as RunDoc;
}

function rowToEvent(row: Record<string, unknown>): EventDoc {
  return row as unknown as EventDoc;
}

export class PostgresAdapter implements BackendAdapter {
  private pool: Pool | null = null;

  async connect(): Promise<void> {
    const connectionString =
      process.env.POSTGRES_URI || process.env.DATABASE_URL || 'postgresql://localhost/stakeout';
    this.pool = new Pool({ connectionString, max: 10 });
    // Verify connection
    const client = await this.pool.connect();
    client.release();
    console.log(`Connected to PostgreSQL: ${connectionString}`);
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  private get _pool(): Pool {
    if (!this.pool) throw new Error('PostgresAdapter not connected');
    return this.pool;
  }

  private async query<T extends Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]> {
    const client: PoolClient = await this._pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows as T[];
    } finally {
      client.release();
    }
  }

  async getRuns(params: {
    filter: RunFilters;
    skip: number;
    limit: number;
    sort: string;
    order: 'asc' | 'desc';
  }): Promise<{ runs: RunDoc[]; total: number }> {
    const { filter, skip, limit, sort, order } = params;
    const conditions: string[] = [];
    const bindParams: unknown[] = [];
    let i = 1;

    if (filter.graph_id) { conditions.push(`graph_id = $${i++}`); bindParams.push(filter.graph_id); }
    if (filter.status) { conditions.push(`status = $${i++}`); bindParams.push(filter.status); }
    if (filter.date_from) { conditions.push(`started_at >= $${i++}`); bindParams.push(new Date(filter.date_from)); }
    if (filter.date_to) { conditions.push(`started_at <= $${i++}`); bindParams.push(new Date(filter.date_to)); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortField = sanitizeSort(sort);
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';

    const [countRows, dataRows] = await Promise.all([
      this.query<{ total: string }>(`SELECT COUNT(*) AS total FROM runs ${where}`, bindParams),
      this.query(
        `SELECT run_id AS _id, graph_id, thread_id, status, started_at, ended_at, error,
                total_input_tokens, total_output_tokens, estimated_cost_usd,
                total_cache_read_tokens, total_cache_creation_tokens,
                run_inputs, parent_run_id, prompt_version
         FROM runs ${where}
         ORDER BY ${sortField} ${sortDir}
         LIMIT $${i++} OFFSET $${i++}`,
        [...bindParams, limit, skip],
      ),
    ]);

    return {
      runs: dataRows.map(rowToRun),
      total: parseInt(countRows[0]?.total ?? '0', 10),
    };
  }

  async getRun(id: string): Promise<RunDoc | null> {
    const rows = await this.query(
      `SELECT run_id AS _id, graph_id, thread_id, status, started_at, ended_at, error,
              total_input_tokens, total_output_tokens, estimated_cost_usd,
              total_cache_read_tokens, total_cache_creation_tokens,
              run_inputs, parent_run_id, prompt_version
       FROM runs WHERE run_id = $1`,
      [id],
    );
    return rows.length > 0 ? rowToRun(rows[0]) : null;
  }

  async getRunEvents(runId: string): Promise<EventDoc[]> {
    const rows = await this.query(
      `SELECT run_id, graph_id, event_type, node_name, timestamp, latency_ms, payload, error,
              messages, input_tokens, output_tokens, model, llm_input, llm_output,
              cache_read_tokens, cache_creation_tokens
       FROM events WHERE run_id = $1 ORDER BY timestamp ASC`,
      [runId],
    );
    return rows.map(rowToEvent);
  }

  async getStats(): Promise<StatsResult> {
    const now = new Date();
    const h24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const d7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [summary24h, activeRows, dailyCost, avgRows] = await Promise.all([
      this.query<Record<string, string>>(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
           SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
           COALESCE(SUM(estimated_cost_usd), 0) AS total_cost,
           COALESCE(SUM(total_input_tokens), 0) AS total_input_tokens,
           COALESCE(SUM(total_output_tokens), 0) AS total_output_tokens
         FROM runs WHERE started_at >= $1`,
        [h24Ago],
      ),
      this.query<{ total: string }>(`SELECT COUNT(*) AS total FROM runs WHERE status = 'running'`),
      this.query<{ date: string; cost: string; count: string }>(
        `SELECT TO_CHAR(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
                SUM(estimated_cost_usd) AS cost, COUNT(*) AS count
         FROM runs
         WHERE started_at >= $1 AND estimated_cost_usd IS NOT NULL
         GROUP BY 1 ORDER BY 1`,
        [d7Ago],
      ),
      this.query<{ avg_ms: string | null }>(
        `SELECT AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000) AS avg_ms
         FROM runs
         WHERE started_at >= $1 AND status = 'completed' AND ended_at IS NOT NULL`,
        [h24Ago],
      ),
    ]);

    const s = summary24h[0] ?? {
      total: '0', completed: '0', failed: '0', running: '0',
      total_cost: '0', total_input_tokens: '0', total_output_tokens: '0',
    };
    const total = parseInt(s.total, 10);
    const completed = parseInt(s.completed, 10);

    return {
      total_runs_24h: total,
      completed_24h: completed,
      failed_24h: parseInt(s.failed, 10),
      running_24h: parseInt(s.running, 10),
      active_runs: parseInt(activeRows[0]?.total ?? '0', 10),
      success_rate_24h: total > 0 ? (completed / total) * 100 : null,
      total_cost_24h: parseFloat(s.total_cost),
      total_input_tokens_24h: parseInt(s.total_input_tokens, 10),
      total_output_tokens_24h: parseInt(s.total_output_tokens, 10),
      avg_duration_ms: avgRows[0]?.avg_ms != null ? parseFloat(avgRows[0].avg_ms) : null,
      daily_cost: dailyCost.map((d) => ({
        date: d.date,
        cost: parseFloat(d.cost),
        count: parseInt(d.count, 10),
      })),
    };
  }

  async getCostStats(since: Date, period: string): Promise<CostBreakdownResult> {
    const [byModel, byGraph, byDay, topRuns] = await Promise.all([
      this.query<Record<string, string>>(
        `SELECT model,
                SUM(input_tokens) AS input_tokens,
                SUM(output_tokens) AS output_tokens,
                COUNT(*) AS call_count
         FROM events
         WHERE timestamp >= $1 AND model IS NOT NULL AND event_type = 'node_end'
         GROUP BY model ORDER BY input_tokens DESC`,
        [since],
      ),
      this.query<Record<string, string>>(
        `SELECT graph_id,
                SUM(estimated_cost_usd) AS total_cost,
                COUNT(*) AS run_count,
                AVG(estimated_cost_usd) AS avg_cost
         FROM runs
         WHERE started_at >= $1 AND estimated_cost_usd IS NOT NULL
         GROUP BY graph_id ORDER BY total_cost DESC`,
        [since],
      ),
      this.query<{ date: string; cost: string; count: string }>(
        `SELECT TO_CHAR(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
                SUM(estimated_cost_usd) AS cost, COUNT(*) AS count
         FROM runs
         WHERE started_at >= $1 AND estimated_cost_usd IS NOT NULL
         GROUP BY 1 ORDER BY 1`,
        [since],
      ),
      this.query(
        `SELECT run_id AS _id, graph_id, thread_id, status, started_at, ended_at, error,
                total_input_tokens, total_output_tokens, estimated_cost_usd,
                total_cache_read_tokens, total_cache_creation_tokens,
                run_inputs, parent_run_id, prompt_version
         FROM runs
         WHERE started_at >= $1 AND estimated_cost_usd IS NOT NULL
         ORDER BY estimated_cost_usd DESC LIMIT 10`,
        [since],
      ),
    ]);

    return {
      period,
      by_model: byModel.map((m) => ({
        model: m.model,
        input_tokens: parseInt(m.input_tokens ?? '0', 10),
        output_tokens: parseInt(m.output_tokens ?? '0', 10),
        call_count: parseInt(m.call_count, 10),
      })),
      by_graph: byGraph.map((g) => ({
        graph_id: g.graph_id,
        total_cost: parseFloat(g.total_cost),
        run_count: parseInt(g.run_count, 10),
        avg_cost: parseFloat(g.avg_cost),
      })),
      by_day: byDay.map((d) => ({ date: d.date, cost: parseFloat(d.cost), count: parseInt(d.count, 10) })),
      top_runs: topRuns.map(rowToRun),
    };
  }

  async getThreads(): Promise<ThreadDoc[]> {
    const rows = await this.query<Record<string, unknown>>(
      `SELECT
         thread_id AS _id,
         COUNT(*) AS run_count,
         MIN(started_at) AS first_run,
         MAX(started_at) AS last_run,
         COALESCE(SUM(estimated_cost_usd), 0) AS total_cost,
         COALESCE(SUM(total_input_tokens), 0) AS total_input_tokens,
         COALESCE(SUM(total_output_tokens), 0) AS total_output_tokens,
         ARRAY_AGG(DISTINCT status) AS statuses,
         ARRAY_AGG(DISTINCT graph_id) FILTER (WHERE graph_id IS NOT NULL) AS graph_ids
       FROM runs
       GROUP BY thread_id
       ORDER BY MAX(started_at) DESC`,
    );
    return rows.map((r) => ({
      _id: r._id as string,
      run_count: parseInt(r.run_count as string, 10),
      first_run: r.first_run as Date,
      last_run: r.last_run as Date,
      total_cost: parseFloat(r.total_cost as string),
      total_input_tokens: parseInt(r.total_input_tokens as string, 10),
      total_output_tokens: parseInt(r.total_output_tokens as string, 10),
      statuses: (r.statuses as string[]) ?? [],
      graph_ids: (r.graph_ids as string[]) ?? [],
    }));
  }

  async getThreadRuns(threadId: string): Promise<Array<RunDoc & { events: EventDoc[] }>> {
    const runs = await this.query(
      `SELECT run_id AS _id, graph_id, thread_id, status, started_at, ended_at, error,
              total_input_tokens, total_output_tokens, estimated_cost_usd,
              total_cache_read_tokens, total_cache_creation_tokens,
              run_inputs, parent_run_id, prompt_version
       FROM runs WHERE thread_id = $1 ORDER BY started_at ASC`,
      [threadId],
    );

    if (runs.length === 0) return [];

    const runIds = runs.map((r) => (r as Record<string, unknown>)._id as string);
    const events = await this.query(
      `SELECT run_id, graph_id, event_type, node_name, timestamp, latency_ms, payload, error,
              messages, input_tokens, output_tokens, model, llm_input, llm_output,
              cache_read_tokens, cache_creation_tokens
       FROM events WHERE run_id = ANY($1) ORDER BY timestamp ASC`,
      [runIds],
    );

    const eventsByRun = events.reduce<Record<string, EventDoc[]>>((acc, ev) => {
      const key = (ev as Record<string, unknown>).run_id as string;
      if (!acc[key]) acc[key] = [];
      acc[key].push(rowToEvent(ev as Record<string, unknown>));
      return acc;
    }, {});

    return runs.map((run) => {
      const r = rowToRun(run as Record<string, unknown>);
      return { ...r, events: eventsByRun[r._id] ?? [] };
    });
  }

  async getGraphs(): Promise<string[]> {
    const rows = await this.query<{ graph_id: string }>(
      `SELECT DISTINCT graph_id FROM runs WHERE graph_id IS NOT NULL ORDER BY graph_id`,
    );
    return rows.map((r) => r.graph_id);
  }

  async getRecentlyUpdatedRuns(since: Date, limit: number): Promise<RunDoc[]> {
    const rows = await this.query(
      `SELECT run_id AS _id, graph_id, thread_id, status, started_at, ended_at, error,
              total_input_tokens, total_output_tokens, estimated_cost_usd,
              total_cache_read_tokens, total_cache_creation_tokens,
              run_inputs, parent_run_id, prompt_version
       FROM runs
       WHERE started_at >= $1 OR (ended_at IS NOT NULL AND ended_at >= $1)
       ORDER BY started_at DESC LIMIT $2`,
      [since, limit],
    );
    return rows.map(rowToRun);
  }
}
