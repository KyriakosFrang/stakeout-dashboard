import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import clsx from 'clsx';
import { api } from '../api';
import type { Run, RunEvent } from '../types';
import { useQuery } from '../hooks/useQuery';
import { useSSEContext } from '../context/SSEContext';
import { StatusBadge } from '../components/StatusBadge';
import { formatCost, formatDuration, formatDate, runDurationMs, truncateId } from '../utils/format';

// ─── Timeline ────────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
  node_start: {
    bg: 'bg-zinc-50 dark:bg-zinc-800/40',
    border: 'border-zinc-200 dark:border-zinc-700',
    dot: 'bg-zinc-400 dark:bg-zinc-500',
  },
  node_end: {
    bg: 'bg-indigo-50 dark:bg-indigo-950/30',
    border: 'border-indigo-200 dark:border-indigo-800/40',
    dot: 'bg-indigo-500 dark:bg-indigo-400',
  },
  tool_call: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800/40',
    dot: 'bg-amber-500 dark:bg-amber-400',
  },
  tool_result: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-800/40',
    dot: 'bg-emerald-500 dark:bg-emerald-400',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800/40',
    dot: 'bg-red-500 dark:bg-red-400',
  },
};

const EVENT_LABELS: Record<string, string> = {
  node_start: 'Node Start',
  node_end: 'Node End',
  tool_call: 'Tool Call',
  tool_result: 'Tool Result',
  error: 'Error',
};

function LatencyBar({ ms, maxMs }: { ms: number; maxMs: number }) {
  const pct = maxMs > 0 ? Math.min(100, (ms / maxMs) * 100) : 0;
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full flex-1 max-w-[120px]">
        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-500 tabular-nums">{formatDuration(ms)}</span>
    </div>
  );
}

function TimelineEvent({ event, maxLatency, onClick, selected }: {
  event: RunEvent;
  maxLatency: number;
  onClick: () => void;
  selected: boolean;
}) {
  const c = EVENT_COLORS[event.event_type] ?? EVENT_COLORS.node_start;
  const hasLLM = event.event_type === 'node_end' && (event.llm_input || event.llm_output);

  return (
    <div
      className={clsx('flex gap-3 cursor-pointer group', selected && 'ring-1 ring-indigo-500 rounded-xl')}
      onClick={onClick}
    >
      <div className="flex flex-col items-center pt-2.5">
        <div className={clsx('w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-zinc-50 dark:ring-zinc-950', c.dot)} />
        <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-800 mt-1" />
      </div>

      <div className={clsx(
        'flex-1 mb-2 border rounded-xl px-4 py-3 transition-colors group-hover:brightness-95 dark:group-hover:brightness-110',
        c.bg, c.border
      )}>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-zinc-800 dark:text-zinc-200 text-sm">{event.node_name}</span>
            <span className="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
              {EVENT_LABELS[event.event_type]}
            </span>
            {event.model && (
              <span className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-1.5 py-0.5 rounded">
                {event.model}
              </span>
            )}
            {event.error && (
              <span className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 px-1.5 py-0.5 rounded">error</span>
            )}
          </div>
          <span className="text-xs text-zinc-400 dark:text-zinc-600 tabular-nums">
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
        </div>

        {event.latency_ms != null && <LatencyBar ms={event.latency_ms} maxMs={maxLatency} />}

        {(event.input_tokens != null || event.output_tokens != null) && (
          <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
            <span>{event.input_tokens?.toLocaleString()} in</span>
            <span>·</span>
            <span>{event.output_tokens?.toLocaleString()} out</span>
          </div>
        )}

        {event.error && (
          <div className="mt-2 text-xs text-red-600 dark:text-red-400 font-mono bg-red-50 dark:bg-red-950/30 px-2 py-1.5 rounded">
            {event.error}
          </div>
        )}

        {hasLLM && !selected && (
          <div className="mt-2 text-xs text-indigo-500 dark:text-indigo-400 opacity-70">Click to view prompts →</div>
        )}
      </div>
    </div>
  );
}

// ─── Prompt Viewer ───────────────────────────────────────────────────────────

const ROLE_STYLES: Record<string, { label: string; bg: string; border: string; text: string }> = {
  system: {
    label: 'SYSTEM',
    bg: 'bg-zinc-50 dark:bg-zinc-800/60',
    border: 'border-zinc-200 dark:border-zinc-700',
    text: 'text-zinc-600 dark:text-zinc-400',
  },
  user: {
    label: 'USER',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    border: 'border-blue-200 dark:border-blue-800/40',
    text: 'text-blue-700 dark:text-blue-300',
  },
  assistant: {
    label: 'ASSISTANT',
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    border: 'border-indigo-200 dark:border-indigo-800/40',
    text: 'text-indigo-700 dark:text-indigo-300',
  },
  tool: {
    label: 'TOOL',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-200 dark:border-amber-800/40',
    text: 'text-amber-700 dark:text-amber-300',
  },
};

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

function PromptViewer({ events }: { events: RunEvent[] }) {
  const llmEvents = events.filter((e) => e.event_type === 'node_end' && (e.llm_input?.length || e.llm_output));

  if (llmEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-zinc-400 dark:text-zinc-600 text-sm">
        No LLM calls captured in this run
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {llmEvents.map((event, i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center gap-3 pb-2 border-b border-zinc-200 dark:border-zinc-800">
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-300">{event.node_name}</span>
            {event.model && (
              <span className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-full">
                {event.model}
              </span>
            )}
            {event.input_tokens != null && (
              <span className="text-xs text-zinc-500 ml-auto tabular-nums">
                {event.input_tokens.toLocaleString()} → {event.output_tokens?.toLocaleString() ?? 0} tokens
              </span>
            )}
          </div>
          {event.llm_input?.map((msg, j) => <MessageBlock key={j} role={msg.role} content={msg.content} />)}
          {event.llm_output && <MessageBlock role="assistant" content={event.llm_output} />}
        </div>
      ))}
    </div>
  );
}

// ─── Raw JSON ────────────────────────────────────────────────────────────────

function RawJson({ run, events }: { run: Run; events: RunEvent[] }) {
  const [view, setView] = useState<'run' | 'events'>('run');
  const data = view === 'run' ? run : events;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['run', 'events'] as const).map((v) => (
          <button
            key={v}
            className={clsx(
              'text-sm px-3 py-1 rounded-lg transition-colors',
              view === v
                ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            )}
            onClick={() => setView(v)}
          >
            {v === 'run' ? 'Run' : `Events (${events.length})`}
          </button>
        ))}
      </div>
      <pre className="prompt-content bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 overflow-auto max-h-[600px] text-zinc-700 dark:text-zinc-300 text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'timeline' | 'prompts' | 'raw';

export function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const { subscribe } = useSSEContext();
  const [activeTab, setActiveTab] = useState<Tab>('timeline');
  const [selectedEvent, setSelectedEvent] = useState<RunEvent | null>(null);

  const { data: run, refetch: refetchRun } = useQuery(() => api.run(id!), [id]);

  const { data: eventsData, refetch: refetchEvents } = useQuery(() => api.runEvents(id!), [id]);
  const events: RunEvent[] = eventsData ?? [];

  useEffect(() => {
    const unsub = subscribe((updatedRuns) => {
      if (updatedRuns.some((r) => r._id === id)) {
        refetchRun();
        refetchEvents();
      }
    });
    return unsub;
  }, [subscribe, id, refetchRun, refetchEvents]);

  if (!run) {
    return <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">Loading run...</div>;
  }

  const duration = runDurationMs(run);
  const maxLatency = Math.max(...events.map((e) => e.latency_ms ?? 0), 1);

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'timeline', label: `Timeline (${events.length})` },
    { key: 'prompts', label: 'Prompts' },
    { key: 'raw', label: 'Raw JSON' },
  ];

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link to="/runs" className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors">Runs</Link>
        <span className="text-zinc-300 dark:text-zinc-700">/</span>
        <span className="text-zinc-500 font-mono">{truncateId(run._id, 16)}</span>
      </div>

      {/* Run header card */}
      <div className="card p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge status={run.status} />
              <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{run.graph_id}</h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded">
                {run._id}
              </span>
              {run.thread_id && (
                <span className="font-mono text-xs text-zinc-400 dark:text-zinc-600">thread: {run.thread_id}</span>
              )}
            </div>
          </div>

          <div className="flex gap-6 flex-wrap">
            <div className="text-center">
              <div className="text-xs text-zinc-500 mb-1">Started</div>
              <div className="text-sm text-zinc-700 dark:text-zinc-300">{formatDate(run.started_at)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-zinc-500 mb-1">Duration</div>
              <div className="text-sm text-zinc-700 dark:text-zinc-300 tabular-nums">{formatDuration(duration)}</div>
            </div>
            {run.total_input_tokens != null && (
              <div className="text-center">
                <div className="text-xs text-zinc-500 mb-1">Tokens</div>
                <div className="text-sm text-zinc-700 dark:text-zinc-300 tabular-nums">
                  {run.total_input_tokens.toLocaleString()} / {(run.total_output_tokens ?? 0).toLocaleString()}
                </div>
              </div>
            )}
            {run.estimated_cost_usd != null && (
              <div className="text-center">
                <div className="text-xs text-zinc-500 mb-1">Cost</div>
                <div className="text-sm font-medium text-amber-600 dark:text-amber-400 tabular-nums">
                  {formatCost(run.estimated_cost_usd)}
                </div>
              </div>
            )}
          </div>
        </div>

        {run.error && (
          <div className="mt-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 rounded-lg px-4 py-3">
            <p className="text-xs text-red-700 dark:text-red-300 font-mono">{run.error}</p>
          </div>
        )}
      </div>

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

      {activeTab === 'timeline' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 space-y-0.5">
            {events.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-zinc-400 dark:text-zinc-600 text-sm">No events recorded</div>
            ) : (
              events.map((event, i) => (
                <TimelineEvent
                  key={i}
                  event={event}
                  maxLatency={maxLatency}
                  selected={selectedEvent === event}
                  onClick={() => setSelectedEvent(selectedEvent === event ? null : event)}
                />
              ))
            )}
          </div>

          <div className="lg:col-span-2">
            {selectedEvent ? (
              <div className="card p-4 sticky top-20 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Event Detail</h3>
                  <button
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
                    onClick={() => setSelectedEvent(null)}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  {[
                    ['Node', selectedEvent.node_name],
                    ['Type', selectedEvent.event_type],
                    ['Time', formatDate(selectedEvent.timestamp)],
                    ['Latency', selectedEvent.latency_ms != null ? formatDuration(selectedEvent.latency_ms) : null],
                    ['Model', selectedEvent.model],
                    ['Input tokens', selectedEvent.input_tokens?.toLocaleString()],
                    ['Output tokens', selectedEvent.output_tokens?.toLocaleString()],
                  ].filter(([, v]) => v != null).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <span className="text-zinc-500">{k}</span>
                      <span className="text-zinc-700 dark:text-zinc-300 font-mono text-right">{v}</span>
                    </div>
                  ))}
                </div>

                {selectedEvent.llm_input && selectedEvent.llm_input.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                    <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Prompt</p>
                    {selectedEvent.llm_input.map((msg, i) => (
                      <MessageBlock key={i} role={msg.role} content={msg.content} />
                    ))}
                    {selectedEvent.llm_output && <MessageBlock role="assistant" content={selectedEvent.llm_output} />}
                  </div>
                )}

                {selectedEvent.payload && Object.keys(selectedEvent.payload).length > 0 && (
                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                    <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Payload</p>
                    <pre className="prompt-content text-zinc-600 dark:text-zinc-400 text-xs bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 overflow-auto max-h-48">
                      {JSON.stringify(selectedEvent.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="card p-6 text-center text-zinc-400 dark:text-zinc-600 text-sm">
                Click an event to inspect it
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'prompts' && <PromptViewer events={events} />}
      {activeTab === 'raw' && <RawJson run={run} events={events} />}
    </div>
  );
}
