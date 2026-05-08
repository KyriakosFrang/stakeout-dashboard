import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { Run, RunFilters, RunStatus } from '../types';
import { useQuery } from '../hooks/useQuery';
import { useSSEContext } from '../context/SSEContext';
import { StatusBadge } from '../components/StatusBadge';
import { formatCost, formatDuration, formatDate, formatTokens, runDurationMs, truncateId } from '../utils/format';

const DEFAULT_FILTERS: RunFilters = {
  page: 1,
  limit: 50,
  sort: 'started_at',
  order: 'desc',
};

function SortIcon({ field, current, order }: { field: string; current: string; order: string }) {
  if (field !== current) return <span className="w-3 h-3 inline-block" />;
  return (
    <svg className="w-3 h-3 inline-block ml-1 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      {order === 'asc'
        ? <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
        : <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />}
    </svg>
  );
}

export function Runs() {
  const [searchParams] = useSearchParams();
  const { subscribe } = useSSEContext();
  const { data: graphs } = useQuery(() => api.graphs(), []);

  const [filters, setFilters] = useState<RunFilters>(() => ({
    ...DEFAULT_FILTERS,
    graph_id: searchParams.get('graph_id') || undefined,
    status: (searchParams.get('status') as RunStatus) || undefined,
    date_from: searchParams.get('date_from') || undefined,
    date_to: searchParams.get('date_to') || undefined,
  }));

  const { data, loading, refetch } = useQuery(() => api.runs(filters), [filters]);

  useEffect(() => {
    const unsub = subscribe(() => refetch());
    return unsub;
  }, [subscribe, refetch]);

  const updateFilter = useCallback((key: keyof RunFilters, value: string | number | undefined) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: key === 'page' ? (value as number) : 1 }));
  }, []);

  const toggleSort = useCallback((field: string) => {
    setFilters((prev) => ({
      ...prev,
      sort: field,
      order: prev.sort === field && prev.order === 'desc' ? 'asc' : 'desc',
      page: 1,
    }));
  }, []);

  const runs: Run[] = data?.runs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / filters.limit);

  const columns = [
    { key: 'status', label: 'Status', sortable: false },
    { key: 'graph_id', label: 'Graph', sortable: true },
    { key: '_id', label: 'Run ID', sortable: false },
    { key: 'started_at', label: 'Started', sortable: true },
    { key: 'duration', label: 'Duration', sortable: false },
    { key: 'total_input_tokens', label: 'In / Out', sortable: true },
    { key: 'estimated_cost_usd', label: 'Cost', sortable: true },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Runs</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {total > 0 ? `${total.toLocaleString()} total` : 'No runs found'}
          </p>
        </div>
        <button onClick={() => refetch()} className="btn-ghost flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <select
          className="select"
          value={filters.graph_id ?? ''}
          onChange={(e) => updateFilter('graph_id', e.target.value || undefined)}
        >
          <option value="">All graphs</option>
          {graphs?.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>

        <select
          className="select"
          value={filters.status ?? ''}
          onChange={(e) => updateFilter('status', e.target.value as RunStatus | '')}
        >
          <option value="">All statuses</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>

        <input
          type="date"
          className="input"
          value={filters.date_from ?? ''}
          onChange={(e) => updateFilter('date_from', e.target.value || undefined)}
        />
        <input
          type="date"
          className="input"
          value={filters.date_to ?? ''}
          onChange={(e) => updateFilter('date_to', e.target.value || undefined)}
        />

        {(filters.graph_id || filters.status || filters.date_from || filters.date_to) && (
          <button className="btn-ghost text-xs" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>
            Clear filters
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-zinc-500">Rows</span>
          <select
            className="select"
            value={filters.limit}
            onChange={(e) => updateFilter('limit', parseInt(e.target.value))}
          >
            {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap
                      ${col.sortable ? 'cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 select-none' : ''}`}
                    onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                  >
                    {col.label}
                    {col.sortable && <SortIcon field={col.key} current={filters.sort} order={filters.order} />}
                  </th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {loading && runs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-zinc-500 text-sm">Loading...</td>
                </tr>
              ) : runs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-zinc-500 text-sm">No runs match your filters</td>
                </tr>
              ) : (
                runs.map((run) => (
                  <tr key={run._id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors group">
                    <td className="px-4 py-3"><StatusBadge status={run.status} size="sm" /></td>
                    <td className="px-4 py-3 text-zinc-800 dark:text-zinc-200 font-medium">{run.graph_id}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-zinc-400 dark:text-zinc-500 text-xs">{truncateId(run._id, 12)}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{formatDate(run.started_at)}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 tabular-nums">{formatDuration(runDurationMs(run))}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 tabular-nums">
                      {run.total_input_tokens != null ? (
                        <span title={`${run.total_input_tokens.toLocaleString()} in / ${(run.total_output_tokens ?? 0).toLocaleString()} out`}>
                          {formatTokens(run.total_input_tokens)} / {formatTokens(run.total_output_tokens)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium">
                      {run.estimated_cost_usd != null ? (
                        <span className="text-amber-600 dark:text-amber-400">{formatCost(run.estimated_cost_usd)}</span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/runs/${run._id}`} className="text-zinc-300 dark:text-zinc-600 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 dark:border-zinc-800">
            <span className="text-xs text-zinc-500">
              {((filters.page - 1) * filters.limit) + 1}–{Math.min(filters.page * filters.limit, total)} of {total.toLocaleString()}
            </span>
            <div className="flex gap-1">
              <button className="btn-ghost text-xs px-2" disabled={filters.page <= 1} onClick={() => updateFilter('page', filters.page - 1)}>← Prev</button>
              <span className="text-xs text-zinc-500 px-3 py-1.5">{filters.page} / {totalPages}</span>
              <button className="btn-ghost text-xs px-2" disabled={filters.page >= totalPages} onClick={() => updateFilter('page', filters.page + 1)}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
