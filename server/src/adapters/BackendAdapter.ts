export interface RunDoc {
  _id: string;
  graph_id: string;
  thread_id: string;
  status: string;
  started_at: string | Date;
  ended_at: string | Date | null;
  error: string | null;
  total_input_tokens?: number | null;
  total_output_tokens?: number | null;
  total_cache_read_tokens?: number | null;
  total_cache_creation_tokens?: number | null;
  estimated_cost_usd?: number | null;
  run_inputs?: string | null;
  parent_run_id?: string | null;
  prompt_version?: string | null;
  [key: string]: unknown;
}

export interface EventDoc {
  run_id: string;
  graph_id: string;
  event_type: string;
  node_name: string;
  timestamp: string | Date;
  latency_ms?: number | null;
  payload?: unknown;
  error?: string | null;
  messages?: unknown;
  input_tokens?: number | null;
  output_tokens?: number | null;
  model?: string | null;
  llm_input?: unknown;
  llm_output?: string | null;
  cache_read_tokens?: number | null;
  cache_creation_tokens?: number | null;
  [key: string]: unknown;
}

export interface ThreadDoc {
  _id: string;
  run_count: number;
  first_run: string | Date;
  last_run: string | Date;
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  statuses: string[];
  graph_ids: string[];
}

export interface RunFilters {
  graph_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
}

export interface StatsResult {
  total_runs_24h: number;
  completed_24h: number;
  failed_24h: number;
  running_24h: number;
  active_runs: number;
  success_rate_24h: number | null;
  total_cost_24h: number;
  total_input_tokens_24h: number;
  total_output_tokens_24h: number;
  avg_duration_ms: number | null;
  daily_cost: Array<{ date: string; cost: number; count: number }>;
}

export interface CostBreakdownResult {
  period: string;
  by_model: Array<{ model: string; input_tokens: number; output_tokens: number; call_count: number }>;
  by_graph: Array<{ graph_id: string; total_cost: number; run_count: number; avg_cost: number }>;
  by_day: Array<{ date: string; cost: number; count: number }>;
  top_runs: RunDoc[];
}

export interface BackendAdapter {
  connect(): Promise<void>;
  close(): Promise<void>;

  getRuns(params: {
    filter: RunFilters;
    skip: number;
    limit: number;
    sort: string;
    order: 'asc' | 'desc';
  }): Promise<{ runs: RunDoc[]; total: number }>;

  getRun(id: string): Promise<RunDoc | null>;
  getRunEvents(runId: string): Promise<EventDoc[]>;

  getStats(): Promise<StatsResult>;
  getCostStats(since: Date, period: string): Promise<CostBreakdownResult>;

  getThreads(): Promise<ThreadDoc[]>;
  getThreadRuns(threadId: string): Promise<Array<RunDoc & { events: EventDoc[] }>>;

  getGraphs(): Promise<string[]>;

  getRecentlyUpdatedRuns(since: Date, limit: number): Promise<RunDoc[]>;
}
