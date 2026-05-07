export type RunStatus = 'running' | 'completed' | 'failed';

export type EventType =
  | 'node_start'
  | 'node_end'
  | 'tool_call'
  | 'tool_result'
  | 'error';

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface Run {
  _id: string;
  graph_id: string;
  thread_id: string;
  status: RunStatus;
  started_at: string;
  ended_at: string | null;
  error: string | null;
  total_input_tokens?: number;
  total_output_tokens?: number;
  estimated_cost_usd?: number;
  metadata?: Record<string, unknown>;
}

export interface RunEvent {
  run_id: string;
  graph_id: string;
  event_type: EventType;
  node_name: string;
  timestamp: string;
  latency_ms?: number;
  payload?: Record<string, unknown>;
  error?: string;
  messages?: Message[];
  input_tokens?: number;
  output_tokens?: number;
  model?: string;
  llm_input?: Message[];
  llm_output?: string;
}

export interface Stats {
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

export interface RunsResponse {
  runs: Run[];
  total: number;
  page: number;
  limit: number;
}

export interface CostStats {
  period: string;
  by_model: Array<{
    model: string;
    input_tokens: number;
    output_tokens: number;
    call_count: number;
  }>;
  by_graph: Array<{
    graph_id: string;
    total_cost: number;
    run_count: number;
    avg_cost: number;
  }>;
  by_day: Array<{ date: string; cost: number; count: number }>;
  top_runs: Run[];
}

export interface RunFilters {
  graph_id?: string;
  status?: RunStatus | '';
  date_from?: string;
  date_to?: string;
  page: number;
  limit: number;
  sort: string;
  order: 'asc' | 'desc';
}
