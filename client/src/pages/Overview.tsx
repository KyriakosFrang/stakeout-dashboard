import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { api } from '../api';
import type { Run } from '../types';
import { useQuery } from '../hooks/useQuery';
import { useSSEContext } from '../context/SSEContext';
import { useTheme } from '../context/ThemeContext';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { formatCost, formatDuration, formatTokens, timeAgo, runDurationMs, truncateId } from '../utils/format';

function RunRow({ run }: { run: Run }) {
  const duration = runDurationMs(run);
  return (
    <Link
      to={`/runs/${run._id}`}
      className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors rounded-lg group"
    >
      <StatusBadge status={run.status} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-800 dark:text-zinc-200 text-sm truncate">{run.graph_id}</span>
          <span className="font-mono text-xs text-zinc-400 dark:text-zinc-600">{truncateId(run._id)}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-zinc-500">{timeAgo(run.started_at)}</span>
          {run.thread_id && (
            <span className="text-xs text-zinc-400 dark:text-zinc-600 font-mono truncate max-w-[100px]" title={run.thread_id}>
              {truncateId(run.thread_id, 10)}
            </span>
          )}
        </div>
      </div>
      <div className="text-right text-xs text-zinc-500 tabular-nums space-y-0.5 hidden sm:block">
        <div>{formatDuration(duration)}</div>
        <div>{formatCost(run.estimated_cost_usd)}</div>
      </div>
      <svg
        className="w-4 h-4 text-zinc-300 dark:text-zinc-700 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CostTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 shadow-xl text-xs">
      <div className="text-zinc-500 mb-1">{label}</div>
      <div className="text-zinc-900 dark:text-zinc-100 font-medium">{formatCost(payload[0].value)}</div>
    </div>
  );
}

export function Overview() {
  const { isDark } = useTheme();
  const { data: stats, loading, refetch } = useQuery(() => api.stats(), []);
  const { subscribe, activeRuns } = useSSEContext();
  const [liveRuns, setLiveRuns] = useState<Run[]>([]);

  const { data: initialRuns } = useQuery(
    () => api.runs({ limit: 10, sort: 'started_at', order: 'desc' }),
    []
  );

  useEffect(() => {
    if (initialRuns) setLiveRuns(initialRuns.runs);
  }, [initialRuns]);

  useEffect(() => {
    const unsub = subscribe((updatedRuns) => {
      refetch();
      setLiveRuns((prev) => {
        const map = new Map(prev.map((r) => [r._id, r]));
        updatedRuns.forEach((r) => map.set(r._id, r));
        return [...map.values()]
          .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
          .slice(0, 15);
      });
    });
    return unsub;
  }, [subscribe, refetch]);

  const chartData = useMemo(() => {
    if (!stats?.daily_cost) return [];
    return stats.daily_cost.map((d) => ({ date: d.date.slice(5), cost: d.cost, count: d.count }));
  }, [stats]);

  const gridColor = isDark ? '#27272a' : '#e4e4e7';
  const axisColor = isDark ? '#71717a' : '#a1a1aa';

  if (loading && !stats) {
    return <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">Loading...</div>;
  }

  const s = stats;
  const successRate = s?.success_rate_24h;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Overview</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Last 24 hours · {activeRuns} active right now</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Runs"
          value={s?.total_runs_24h ?? '—'}
          sub={`${s?.completed_24h ?? 0} completed · ${s?.failed_24h ?? 0} failed`}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
            </svg>
          }
        />
        <StatCard
          label="Success Rate"
          value={successRate != null ? `${successRate.toFixed(1)}%` : '—'}
          sub="completed / total"
          accent={successRate == null ? 'default' : successRate >= 95 ? 'green' : successRate >= 80 ? 'amber' : 'red'}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Total Cost"
          value={formatCost(s?.total_cost_24h)}
          sub={`${formatTokens(s?.total_input_tokens_24h)} in · ${formatTokens(s?.total_output_tokens_24h)} out`}
          accent="amber"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33" />
            </svg>
          }
        />
        <StatCard
          label="Avg Duration"
          value={formatDuration(s?.avg_duration_ms)}
          sub="completed runs"
          accent="blue"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Cost trend + Recent runs */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="card p-5 lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Cost (7 days)</h2>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `€${v.toFixed(2)}`} />
                <Tooltip content={<CostTooltip />} />
                <Area type="monotone" dataKey="cost" stroke="#6366f1" strokeWidth={2} fill="url(#costGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-zinc-400 dark:text-zinc-600 text-sm">
              No cost data yet
            </div>
          )}
        </div>

        <div className="card lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Recent Runs</h2>
            <Link to="/runs" className="text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors">
              View all →
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {liveRuns.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-zinc-400 dark:text-zinc-600 text-sm">
                No runs yet
              </div>
            ) : (
              liveRuns.map((run) => <RunRow key={run._id} run={run} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
