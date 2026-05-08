import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import clsx from 'clsx';
import { api } from '../api';
import type { RunWithEvents, RunEvent, RunStatus } from '../types';
import { useQuery } from '../hooks/useQuery';
import { StatusBadge } from '../components/StatusBadge';
import { ConversationGraph } from '../components/graph/ConversationGraph';
import {
  formatCost,
  formatDuration,
  formatDate,
  formatTokens,
  runDurationMs,
  truncateId,
  timeAgo,
} from '../utils/format';

// ─── Shared helpers ────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<string, { dot: string; bg: string; border: string }> = {
  node_start: { dot: 'bg-zinc-400 dark:bg-zinc-500', bg: 'bg-zinc-50 dark:bg-zinc-800/40', border: 'border-zinc-200 dark:border-zinc-700' },
  node_end: { dot: 'bg-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950/30', border: 'border-indigo-200 dark:border-indigo-800/40' },
  tool_call: { dot: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800/40' },
  tool_result: { dot: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800/40' },
  retriever_start: { dot: 'bg-sky-500 dark:bg-sky-400', bg: 'bg-sky-50 dark:bg-sky-950/30', border: 'border-sky-200 dark:border-sky-800/40' },
  retriever_end: { dot: 'bg-cyan-500 dark:bg-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-950/30', border: 'border-cyan-200 dark:border-cyan-800/40' },
  error: { dot: 'bg-red-500', bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800/40' },
};

const EVENT_LABELS: Record<string, string> = {
  node_start: 'Node Start',
  node_end: 'Node End',
  tool_call: 'Tool Call',
  tool_result: 'Tool Result',
  retriever_start: 'Retriever',
  retriever_end: 'Retrieved',
  error: 'Error',
};

const ROLE_STYLES: Record<string, { label: string; bg: string; border: string; text: string }> = {
  system: { label: 'SYSTEM', bg: 'bg-zinc-50 dark:bg-zinc-800/60', border: 'border-zinc-200 dark:border-zinc-700', text: 'text-zinc-600 dark:text-zinc-400' },
  user: { label: 'USER', bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-200 dark:border-blue-800/40', text: 'text-blue-700 dark:text-blue-300' },
  assistant: { label: 'ASSISTANT', bg: 'bg-indigo-50 dark:bg-indigo-950/40', border: 'border-indigo-200 dark:border-indigo-800/40', text: 'text-indigo-700 dark:text-indigo-300' },
  tool: { label: 'TOOL', bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-800/40', text: 'text-amber-700 dark:text-amber-300' },
};

function threadStatus(runs: RunWithEvents[]): RunStatus {
  const statuses = runs.map((r) => r.status);
  if (statuses.includes('running')) return 'running';
  if (statuses.includes('failed')) return 'failed';
  return 'completed';
}

// ─── Message block ─────────────────────────────────────────────────────────────

function MessageBlock({ role, content }: { role: string; content: string }) {
  const [expanded, setExpanded] = useState(content.length < 800);
  const s = ROLE_STYLES[role] ?? ROLE_STYLES.user;

  return (
    <div className={clsx('border rounded-lg overflow-hidden', s.border)}>
      <div className={clsx('px-3 py-1.5 flex items-center justify-between', s.bg)}>
        <span className={clsx('text-xs font-mono font-medium tracking-widest', s.text)}>{s.label}</span>
        {content.length >= 800 && (
          <button
            className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            onClick={() => setExpanded((p) => !p)}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>
      <div className={clsx('px-3 py-3 border-t', s.bg, s.border)}>
        <pre className={clsx('prompt-content text-zinc-700 dark:text-zinc-300', !expanded && 'line-clamp-3')}>
          {content}
        </pre>
      </div>
    </div>
  );
}

// ─── Run History tab ───────────────────────────────────────────────────────────

function EventRow({ event }: { event: RunEvent }) {
  const [open, setOpen] = useState(false);
  const c = EVENT_COLORS[event.event_type] ?? EVENT_COLORS.node_start;
  const hasDetail = !!(event.llm_input?.length || event.llm_output || event.payload || event.error);

  return (
    <div className={clsx('border rounded-lg overflow-hidden', c.border)}>
      <button
        className={clsx(
          'w-full text-left px-3 py-2.5 flex items-center gap-3',
          c.bg,
          hasDetail && 'cursor-pointer hover:brightness-95 dark:hover:brightness-110'
        )}
        onClick={() => hasDetail && setOpen((p) => !p)}
        disabled={!hasDetail}
      >
        <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', c.dot)} />
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex-1">{event.node_name}</span>
        <span className="text-xs text-zinc-500 bg-white/60 dark:bg-zinc-900/40 px-1.5 py-0.5 rounded">
          {EVENT_LABELS[event.event_type]}
        </span>
        {event.model && (
          <span className="text-xs text-indigo-600 dark:text-indigo-400">{event.model}</span>
        )}
        {event.latency_ms != null && (
          <span className="text-xs text-zinc-400 tabular-nums">{formatDuration(event.latency_ms)}</span>
        )}
        {event.input_tokens != null && (
          <span className="text-xs text-zinc-400 tabular-nums">
            {formatTokens(event.input_tokens)} in · {formatTokens(event.output_tokens)} out
            {event.cache_read_tokens != null && event.cache_read_tokens > 0 && (
              <span className="text-sky-500 dark:text-sky-400 ml-1">· {formatTokens(event.cache_read_tokens)} cached</span>
            )}
          </span>
        )}
        <span className="text-xs text-zinc-400">{new Date(event.timestamp).toLocaleTimeString()}</span>
        {hasDetail && (
          <svg className={clsx('w-3 h-3 text-zinc-400 transition-transform', open && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </button>

      {open && (
        <div className="px-4 py-3 space-y-3 border-t border-current/10 bg-white dark:bg-zinc-900">
          {event.error && (
            <div className="text-xs text-red-600 dark:text-red-400 font-mono bg-red-50 dark:bg-red-950/30 px-2 py-1.5 rounded">
              {event.error}
            </div>
          )}
          {event.llm_input?.map((msg, i) => (
            <MessageBlock key={i} role={msg.role} content={msg.content} />
          ))}
          {event.llm_output && <MessageBlock role="assistant" content={event.llm_output} />}
          {event.payload && Object.keys(event.payload).length > 0 && (
            <pre className="prompt-content text-zinc-600 dark:text-zinc-400 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 overflow-auto max-h-48">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function RunHistoryTab({ runs }: { runs: RunWithEvents[] }) {
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set(runs.map((r) => r._id)));

  const toggle = (id: string) =>
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      {runs.map((run, runIdx) => {
        const isOpen = expandedRuns.has(run._id);
        const duration = runDurationMs(run);
        return (
          <div key={run._id} className="card overflow-hidden">
            {/* Run header */}
            <button
              className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
              onClick={() => toggle(run._id)}
            >
              <span className="text-xs font-medium text-zinc-400 dark:text-zinc-600 tabular-nums w-6 text-right flex-shrink-0">
                #{runIdx + 1}
              </span>
              <StatusBadge status={run.status} size="sm" />
              <span className="font-medium text-zinc-800 dark:text-zinc-200 text-sm">{run.graph_id}</span>
              <Link
                to={`/runs/${run._id}`}
                onClick={(e) => e.stopPropagation()}
                className="font-mono text-xs text-zinc-400 dark:text-zinc-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                title={run._id}
              >
                {truncateId(run._id, 12)}
              </Link>
              <span className="text-xs text-zinc-400 ml-auto">{formatDate(run.started_at)}</span>
              {duration != null && (
                <span className="text-xs text-zinc-500 tabular-nums">{formatDuration(duration)}</span>
              )}
              {run.events.length > 0 && (
                <span className="text-xs text-zinc-400">{run.events.length} events</span>
              )}
              {run.estimated_cost_usd != null && (
                <span className="text-xs text-amber-600 dark:text-amber-400 tabular-nums font-medium">
                  {formatCost(run.estimated_cost_usd)}
                </span>
              )}
              <svg className={clsx('w-3.5 h-3.5 text-zinc-400 transition-transform flex-shrink-0', isOpen && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {isOpen && (
              <div className="border-t border-zinc-100 dark:border-zinc-800 px-5 py-4 space-y-2">
                {run.error && (
                  <div className="mb-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 rounded-lg px-4 py-2">
                    <p className="text-xs text-red-700 dark:text-red-300 font-mono">{run.error}</p>
                  </div>
                )}
                {run.events.length === 0 ? (
                  <p className="text-xs text-zinc-400 dark:text-zinc-600 text-center py-4">No events recorded</p>
                ) : (
                  run.events.map((ev, i) => <EventRow key={i} event={ev} />)
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Conversation Replay tab ───────────────────────────────────────────────────

interface ConversationTurn {
  runId: string;
  runIdx: number;
  nodeName: string;
  model?: string;
  timestamp: string;
  messages: Array<{ role: string; content: string }>;
}

function ConversationReplayTab({ runs }: { runs: RunWithEvents[] }) {
  const turns: ConversationTurn[] = [];

  runs.forEach((run, runIdx) => {
    run.events.forEach((ev) => {
      if (ev.event_type === 'node_end' && (ev.llm_input?.length || ev.llm_output)) {
        const messages: ConversationTurn['messages'] = [];
        if (ev.llm_input) messages.push(...ev.llm_input);
        if (ev.llm_output) messages.push({ role: 'assistant', content: ev.llm_output });
        if (messages.length > 0) {
          turns.push({
            runId: run._id,
            runIdx,
            nodeName: ev.node_name,
            model: ev.model,
            timestamp: ev.timestamp,
            messages,
          });
        }
      }
    });
  });

  if (turns.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-zinc-400 dark:text-zinc-600 text-sm">
        No LLM calls captured in this thread
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {turns.map((turn, i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center gap-3 pb-2 border-b border-zinc-200 dark:border-zinc-800">
            <span className="text-xs text-zinc-400 dark:text-zinc-600 font-medium tabular-nums">Run #{turn.runIdx + 1}</span>
            <span className="w-px h-3 bg-zinc-200 dark:bg-zinc-700" />
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-300">{turn.nodeName}</span>
            {turn.model && (
              <span className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-full">
                {turn.model}
              </span>
            )}
            <Link
              to={`/runs/${turn.runId}`}
              className="ml-auto text-xs text-zinc-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors font-mono"
              title={turn.runId}
            >
              {truncateId(turn.runId, 12)} →
            </Link>
            <span className="text-xs text-zinc-400">{new Date(turn.timestamp).toLocaleTimeString()}</span>
          </div>
          {turn.messages.map((msg, j) => (
            <MessageBlock key={j} role={msg.role} content={msg.content} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'graph' | 'history' | 'conversation';

export function ThreadDetail() {
  const { threadId } = useParams<{ threadId: string }>();
  const decoded = threadId ? decodeURIComponent(threadId) : '';
  const [activeTab, setActiveTab] = useState<Tab>('graph');

  const { data: runs, loading } = useQuery(() => api.threadRuns(decoded), [decoded]);
  const runList: RunWithEvents[] = runs ?? [];

  const totalCost = runList.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0);
  const totalInputTokens = runList.reduce((s, r) => s + (r.total_input_tokens ?? 0), 0);
  const totalOutputTokens = runList.reduce((s, r) => s + (r.total_output_tokens ?? 0), 0);
  const totalEvents = runList.reduce((s, r) => s + r.events.length, 0);
  const firstRun = runList[0];
  const lastRun = runList[runList.length - 1];
  const overallStatus = runList.length > 0 ? threadStatus(runList) : 'completed';

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'graph', label: 'Graph' },
    { key: 'history', label: `Run History (${runList.length})` },
    { key: 'conversation', label: 'Conversation Replay' },
  ];

  if (loading && runList.length === 0) {
    return <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">Loading thread...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link to="/threads" className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors">
          Threads
        </Link>
        <span className="text-zinc-300 dark:text-zinc-700">/</span>
        <span className="text-zinc-500 font-mono">{truncateId(decoded, 24)}</span>
      </div>

      {/* Thread header */}
      <div className="card p-5 space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <StatusBadge status={overallStatus} />
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Thread</h1>
            </div>
            <div className="font-mono text-xs text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded inline-block">
              {decoded}
            </div>
          </div>

          <div className="flex gap-6 flex-wrap">
            <div className="text-center">
              <div className="text-xs text-zinc-500 mb-1">Runs</div>
              <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 tabular-nums">{runList.length}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-zinc-500 mb-1">Events</div>
              <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 tabular-nums">{totalEvents}</div>
            </div>
            {firstRun && (
              <div className="text-center">
                <div className="text-xs text-zinc-500 mb-1">Started</div>
                <div className="text-sm text-zinc-700 dark:text-zinc-300">{formatDate(firstRun.started_at)}</div>
              </div>
            )}
            {lastRun && lastRun !== firstRun && (
              <div className="text-center">
                <div className="text-xs text-zinc-500 mb-1">Last run</div>
                <div className="text-sm text-zinc-700 dark:text-zinc-300">{timeAgo(lastRun.started_at)}</div>
              </div>
            )}
            {totalInputTokens > 0 && (
              <div className="text-center">
                <div className="text-xs text-zinc-500 mb-1">Total tokens</div>
                <div className="text-sm text-zinc-700 dark:text-zinc-300 tabular-nums">
                  {formatTokens(totalInputTokens)} / {formatTokens(totalOutputTokens)}
                </div>
              </div>
            )}
            {totalCost > 0 && (
              <div className="text-center">
                <div className="text-xs text-zinc-500 mb-1">Total cost</div>
                <div className="text-sm font-medium text-amber-600 dark:text-amber-400 tabular-nums">
                  {formatCost(totalCost)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Graph IDs */}
        {runList.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-zinc-100 dark:border-zinc-800">
            <span className="text-xs text-zinc-400">Graphs:</span>
            {[...new Set(runList.map((r) => r.graph_id))].map((g) => (
              <span key={g} className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded">
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

      {runList.length === 0 ? (
        <div className="card flex items-center justify-center h-48 text-zinc-400 dark:text-zinc-600 text-sm">
          No runs found for this thread
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="border-b border-zinc-200 dark:border-zinc-800">
            <nav className="flex gap-1">
              {tabs.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={clsx('px-4 py-2.5 text-sm font-medium transition-colors', activeTab === key ? 'tab-active' : 'tab-inactive')}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>

          {activeTab === 'graph' && <ConversationGraph runs={runList} />}
          {activeTab === 'history' && <RunHistoryTab runs={runList} />}
          {activeTab === 'conversation' && <ConversationReplayTab runs={runList} />}
        </>
      )}
    </div>
  );
}
