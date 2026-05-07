import type { Run, RunEvent, RunsResponse, Stats, CostStats, RunFilters } from './types';

const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  stats: (): Promise<Stats> => get('/stats'),

  runs: (filters: Partial<RunFilters> = {}): Promise<RunsResponse> => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== '') params.set(k, String(v));
    });
    const qs = params.toString();
    return get(`/runs${qs ? `?${qs}` : ''}`);
  },

  run: (id: string): Promise<Run> => get(`/runs/${id}`),

  runEvents: (id: string): Promise<RunEvent[]> => get(`/runs/${id}/events`),

  graphs: (): Promise<string[]> => get('/graphs'),

  costStats: (period: string): Promise<CostStats> => get(`/stats/cost?period=${period}`),
};
