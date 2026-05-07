import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { api } from '../api';
import { useQuery } from '../hooks/useQuery';
import { useTheme } from '../context/ThemeContext';
import { formatCost, formatDuration, runDurationMs, truncateId } from '../utils/format';
import { StatusBadge } from '../components/StatusBadge';
import { StatCard } from '../components/StatCard';

const PERIOD_OPTIONS = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
];

const MODEL_COLORS = [
  '#6366f1', '#22d3ee', '#f59e0b', '#34d399', '#f43f5e',
  '#a78bfa', '#fb923c', '#4ade80', '#60a5fa', '#e879f9',
];

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name?: string }>;
  label?: string;
}

function DarkTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 shadow-xl text-xs space-y-1">
      {label && <div className="text-zinc-500 mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          {p.name && <span className="text-zinc-500">{p.name}:</span>}
          <span className="text-zinc-900 dark:text-zinc-100 font-medium">{formatCost(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function Cost() {
  const [period, setPeriod] = useState('30d');
  const { isDark } = useTheme();

  const { data, loading } = useQuery(() => api.costStats(period), [period]);
  const { data: stats } = useQuery(() => api.stats(), []);

  const gridColor = isDark ? '#27272a' : '#e4e4e7';
  const axisColor = isDark ? '#71717a' : '#a1a1aa';

  if (loading && !data) {
    return <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">Loading cost data...</div>;
  }

  const totalCost = data?.by_day.reduce((s, d) => s + d.cost, 0) ?? 0;
  const totalRuns = data?.by_day.reduce((s, d) => s + d.count, 0) ?? 0;
  const avgCostPerRun = totalRuns > 0 ? totalCost / totalRuns : null;

  const modelData = (data?.by_model ?? []).map((m) => ({
    model: m.model,
    total_tokens: m.input_tokens + m.output_tokens,
    call_count: m.call_count,
    input_tokens: m.input_tokens,
    output_tokens: m.output_tokens,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Cost Analytics</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Token usage and estimated spend</p>
        </div>
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1">
          {PERIOD_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === value
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Cost" value={formatCost(totalCost)} sub={`last ${period}`} accent="amber" />
        <StatCard label="Total Runs" value={totalRuns.toLocaleString()} sub="with cost data" />
        <StatCard label="Avg / Run" value={formatCost(avgCostPerRun)} sub="estimated" accent="amber" />
        <StatCard
          label="Today (24h)"
          value={formatCost(stats?.total_cost_24h)}
          sub="all graphs"
          accent={stats?.total_cost_24h ? 'amber' : 'default'}
        />
      </div>

      {/* Cost over time */}
      <div className="card p-5">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">Cost Over Time</h2>
        {data?.by_day && data.by_day.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.by_day} margin={{ top: 0, right: 0, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="costAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: axisColor, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `€${v.toFixed(2)}`}
              />
              <Tooltip content={<DarkTooltip />} />
              <Area type="monotone" dataKey="cost" stroke="#f59e0b" strokeWidth={2} fill="url(#costAreaGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[220px] flex items-center justify-center text-zinc-400 dark:text-zinc-600 text-sm">
            No cost data for this period
          </div>
        )}
      </div>

      {/* By graph + By model */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">Cost by Graph</h2>
          {data?.by_graph && data.by_graph.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.by_graph} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: axisColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `€${v.toFixed(3)}`}
                />
                <YAxis
                  type="category"
                  dataKey="graph_id"
                  tick={{ fill: isDark ? '#a1a1aa' : '#52525b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={90}
                />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="total_cost" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-zinc-400 dark:text-zinc-600 text-sm">No data</div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">Token Volume by Model</h2>
          {modelData.length > 0 ? (
            <div className="space-y-3">
              {modelData.map((m, i) => {
                const maxTokens = Math.max(...modelData.map((x) => x.total_tokens), 1);
                const pct = (m.total_tokens / maxTokens) * 100;
                return (
                  <div key={m.model} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                        <span className="text-zinc-700 dark:text-zinc-300 font-medium">{m.model}</span>
                      </div>
                      <span className="text-zinc-500 tabular-nums">
                        {m.total_tokens.toLocaleString()} tokens · {m.call_count} calls
                      </span>
                    </div>
                    <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: MODEL_COLORS[i % MODEL_COLORS.length] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-zinc-400 dark:text-zinc-600 text-sm">No LLM call data</div>
          )}
        </div>
      </div>

      {/* Top expensive runs */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Most Expensive Runs</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              {['Status', 'Graph', 'Run ID', 'Started', 'Duration', 'Tokens', 'Cost'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">{h}</th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {!data?.top_runs?.length ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-zinc-400 dark:text-zinc-600 text-sm">No runs with cost data</td>
              </tr>
            ) : (
              data.top_runs.map((run) => (
                <tr key={run._id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                  <td className="px-4 py-3"><StatusBadge status={run.status} size="sm" /></td>
                  <td className="px-4 py-3 text-zinc-800 dark:text-zinc-200 font-medium">{run.graph_id}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400 dark:text-zinc-500">{truncateId(run._id, 12)}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap text-xs">
                    {new Date(run.started_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 tabular-nums">{formatDuration(runDurationMs(run))}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 tabular-nums text-xs">
                    {run.total_input_tokens != null
                      ? `${run.total_input_tokens.toLocaleString()} / ${(run.total_output_tokens ?? 0).toLocaleString()}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 font-medium text-amber-600 dark:text-amber-400 tabular-nums">{formatCost(run.estimated_cost_usd)}</td>
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
    </div>
  );
}
