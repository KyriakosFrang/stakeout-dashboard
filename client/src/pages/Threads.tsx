import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { api } from '../api';
import type { Thread, RunStatus } from '../types';
import { useQuery } from '../hooks/useQuery';
import { formatCost, formatTokens, timeAgo, truncateId } from '../utils/format';

function threadOverallStatus(statuses: RunStatus[]): RunStatus {
  if (statuses.includes('running')) return 'running';
  if (statuses.includes('failed')) return 'failed';
  return 'completed';
}

const STATUS_DOT: Record<RunStatus, string> = {
  running: 'bg-blue-500 animate-pulse',
  completed: 'bg-emerald-500',
  failed: 'bg-red-500',
};

const STATUS_LABEL: Record<RunStatus, string> = {
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
};

function StatusDot({ status }: { status: RunStatus }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', STATUS_DOT[status])} />
      <span className={clsx(
        'text-xs font-medium',
        status === 'running' ? 'text-blue-600 dark:text-blue-400' :
        status === 'failed' ? 'text-red-600 dark:text-red-400' :
        'text-emerald-600 dark:text-emerald-400'
      )}>
        {STATUS_LABEL[status]}
      </span>
    </span>
  );
}

export function Threads() {
  const { data: threads, loading, refetch } = useQuery(() => api.threads(), []);

  const list: Thread[] = threads ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Threads</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {list.length > 0 ? `${list.length.toLocaleString()} conversation${list.length !== 1 ? 's' : ''}` : 'No threads found'}
          </p>
        </div>
        <button onClick={() => refetch()} className="btn-ghost flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Refresh
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                {['Status', 'Thread ID', 'Graphs', 'Runs', 'Last active', 'Tokens', 'Cost'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {loading && list.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-zinc-500 text-sm">Loading...</td>
                </tr>
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-zinc-500 text-sm">No threads found</td>
                </tr>
              ) : (
                list.map((thread) => {
                  const status = threadOverallStatus(thread.statuses);
                  return (
                    <tr key={thread._id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors group">
                      <td className="px-4 py-3">
                        <StatusDot status={status} />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/threads/${encodeURIComponent(thread._id)}`}
                          className="font-mono text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
                          title={thread._id}
                        >
                          {truncateId(thread._id, 20)}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {thread.graph_ids.map((g) => (
                            <span key={g} className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-1.5 py-0.5 rounded">
                              {g}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                        {thread.run_count}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                        {timeAgo(thread.last_run)}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 tabular-nums whitespace-nowrap">
                        {thread.total_input_tokens > 0
                          ? `${formatTokens(thread.total_input_tokens)} / ${formatTokens(thread.total_output_tokens)}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 tabular-nums font-medium">
                        {thread.total_cost > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400">{formatCost(thread.total_cost)}</span>
                        ) : (
                          <span className="text-zinc-400 dark:text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/threads/${encodeURIComponent(thread._id)}`}
                          className="text-zinc-300 dark:text-zinc-600 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
