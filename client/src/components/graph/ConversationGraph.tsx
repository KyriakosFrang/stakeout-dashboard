import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  BackgroundVariant,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import clsx from 'clsx';
import type { RunWithEvents, RunEvent } from '../../types';
import {
  formatDuration,
  formatTokens,
  formatDate,
  formatCost,
  truncateId,
  runDurationMs,
} from '../../utils/format';
import { useTheme } from '../../context/ThemeContext';
import { StatusBadge } from '../StatusBadge';
import { Link } from 'react-router-dom';

// ─── Layout constants ─────────────────────────────────────────────────────────

const NW = 228;   // node width
const NH = 90;    // node height
const HGAP = 52;  // horizontal gap between event nodes
const RPAD = { top: 52, right: 32, bottom: 28, left: 32 };
const RGAP = 72;  // vertical gap between run groups

// ─── Event config ─────────────────────────────────────────────────────────────

type EventCfg = { label: string; dot: string; bg: string; border: string; edge: string; minimap: string };

const EVENT_CFG: Record<string, EventCfg> = {
  node_start: {
    label: 'Node Start',
    dot: 'bg-zinc-400',
    bg: 'bg-zinc-50 dark:bg-zinc-800/60',
    border: 'border-zinc-300 dark:border-zinc-600',
    edge: '#71717a',
    minimap: '#a1a1aa',
  },
  node_end: {
    label: 'Node End',
    dot: 'bg-indigo-500',
    bg: 'bg-indigo-50 dark:bg-indigo-950/50',
    border: 'border-indigo-300 dark:border-indigo-600',
    edge: '#6366f1',
    minimap: '#818cf8',
  },
  tool_call: {
    label: 'Tool Call',
    dot: 'bg-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/50',
    border: 'border-amber-300 dark:border-amber-600',
    edge: '#f59e0b',
    minimap: '#fbbf24',
  },
  tool_result: {
    label: 'Tool Result',
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-950/50',
    border: 'border-emerald-300 dark:border-emerald-600',
    edge: '#10b981',
    minimap: '#34d399',
  },
  error: {
    label: 'Error',
    dot: 'bg-red-500',
    bg: 'bg-red-50 dark:bg-red-950/50',
    border: 'border-red-300 dark:border-red-600',
    edge: '#ef4444',
    minimap: '#f87171',
  },
};

const fallbackCfg: EventCfg = EVENT_CFG.node_start;

// ─── EventNode ────────────────────────────────────────────────────────────────

function EventNode({ data, selected }: NodeProps) {
  const event = data.event as RunEvent;
  const isLive = data.isLive as boolean | undefined;
  const cfg = EVENT_CFG[event.event_type] ?? fallbackCfg;

  const toolName =
    event.event_type === 'tool_call'
      ? (event.payload?.tool_name as string) ?? (event.payload?.name as string) ?? null
      : event.event_type === 'tool_result'
      ? (event.payload?.tool_name as string) ?? (event.payload?.name as string) ?? null
      : null;

  return (
    <div
      className={clsx(
        'rounded-xl border-2 shadow-sm transition-all duration-150 select-none',
        cfg.bg,
        cfg.border,
        selected && 'ring-2 ring-indigo-500 ring-offset-1 shadow-lg shadow-indigo-500/20',
        isLive && 'animate-pulse'
      )}
      style={{ width: NW, minHeight: NH }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: 'transparent', border: 'none', width: 4, height: 4, left: -2 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: 'transparent', border: 'none', width: 4, height: 4, right: -2 }}
      />

      <div className="px-3.5 pt-3 pb-2.5 flex flex-col gap-1">
        {/* Type badge row */}
        <div className="flex items-center gap-1.5">
          <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', cfg.dot)} />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {cfg.label}
          </span>
          {isLive && (
            <span className="ml-auto text-[10px] font-medium text-blue-500 bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 rounded-full">
              live
            </span>
          )}
        </div>

        {/* Node name */}
        <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 leading-tight truncate">
          {toolName ?? event.node_name}
        </div>

        {/* Model chip */}
        {event.model && (
          <div className="text-[10px] text-indigo-600 dark:text-indigo-400 truncate font-mono">
            {event.model.replace('claude-', '').replace('-20', ' 20')}
          </div>
        )}

        {/* Error hint */}
        {event.error && (
          <div className="text-[10px] text-red-600 dark:text-red-400 truncate">
            {event.error.slice(0, 48)}
          </div>
        )}

        {/* Stats row */}
        {(event.latency_ms != null || event.input_tokens != null) && (
          <div className="flex items-center gap-2 mt-0.5">
            {event.latency_ms != null && (
              <span className="text-[10px] text-zinc-500 tabular-nums font-medium">
                {formatDuration(event.latency_ms)}
              </span>
            )}
            {event.input_tokens != null && (
              <>
                <span className="text-zinc-300 dark:text-zinc-700 text-[10px]">·</span>
                <span className="text-[10px] text-zinc-500 tabular-nums">
                  {formatTokens(event.input_tokens)}↑ {formatTokens(event.output_tokens)}↓
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── RunGroupNode ─────────────────────────────────────────────────────────────

function RunGroupNode({ data }: NodeProps) {
  const run = data.run as RunWithEvents;
  const runIdx = data.runIdx as number;
  const duration = runDurationMs(run);

  return (
    <div
      className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700 bg-white/40 dark:bg-zinc-900/30 relative"
      style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {/* Run label bar */}
      <div className="absolute top-0 left-0 right-0 h-12 px-4 flex items-center gap-2.5 rounded-t-2xl bg-zinc-50/80 dark:bg-zinc-900/60 border-b border-dashed border-zinc-200 dark:border-zinc-700">
        <span className="text-xs font-bold text-zinc-400 dark:text-zinc-600 tabular-nums">#{runIdx + 1}</span>
        <StatusBadge status={run.status} size="sm" />
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 truncate">{run.graph_id}</span>
        <span className="ml-auto font-mono text-[10px] text-zinc-400 dark:text-zinc-600">{truncateId(run._id, 12)}</span>
        {duration != null && (
          <span className="text-[10px] text-zinc-400 tabular-nums">{formatDuration(duration)}</span>
        )}
        {run.estimated_cost_usd != null && run.estimated_cost_usd > 0 && (
          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 tabular-nums">
            {formatCost(run.estimated_cost_usd)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Layout builder ───────────────────────────────────────────────────────────

function buildLayout(runs: RunWithEvents[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  let rowY = 0;
  let prevRunLastId: string | null = null;

  for (let ri = 0; ri < runs.length; ri++) {
    const run = runs[ri];
    const events = run.events;
    const n = Math.max(events.length, 1);

    const groupW = RPAD.left + n * NW + (n - 1) * HGAP + RPAD.right;
    const groupH = RPAD.top + NH + RPAD.bottom;

    // Background group node
    nodes.push({
      id: `group-${run._id}`,
      type: 'runGroup',
      position: { x: -RPAD.left, y: rowY },
      data: { run, runIdx: ri },
      style: { width: groupW, height: groupH },
      selectable: false,
      draggable: false,
      zIndex: -1,
    });

    const isLastRunAndRunning = run.status === 'running';
    let firstNodeId: string | null = null;
    let lastNodeId: string | null = null;

    events.forEach((event, ei) => {
      const nodeId = `ev-${run._id}-${ei}`;
      if (ei === 0) firstNodeId = nodeId;
      lastNodeId = nodeId;

      nodes.push({
        id: nodeId,
        type: 'eventNode',
        position: {
          x: ei * (NW + HGAP),
          y: rowY + RPAD.top,
        },
        data: {
          event,
          runIdx: ri,
          evIdx: ei,
          isLive: isLastRunAndRunning && ei === events.length - 1,
        },
        zIndex: 10,
      });

      // Intra-run edge
      if (ei > 0) {
        const prevId = `ev-${run._id}-${ei - 1}`;
        const cfg = EVENT_CFG[event.event_type] ?? fallbackCfg;
        edges.push({
          id: `e-intra-${run._id}-${ei}`,
          source: prevId,
          target: nodeId,
          type: 'smoothstep',
          animated: isLastRunAndRunning && ei === events.length - 1,
          style: { stroke: cfg.edge, strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: cfg.edge, width: 16, height: 16 },
        });
      }
    });

    // Thread-continuation edge (last node of prev run → first node of this run)
    if (ri > 0 && prevRunLastId && firstNodeId) {
      edges.push({
        id: `e-thread-${ri}`,
        source: prevRunLastId,
        target: firstNodeId,
        type: 'smoothstep',
        animated: true,
        label: `↓ Run #${ri + 1}`,
        labelStyle: { fill: '#6366f1', fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: 'transparent' },
        style: {
          stroke: '#6366f1',
          strokeWidth: 2,
          strokeDasharray: '6 4',
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1', width: 14, height: 14 },
        zIndex: 5,
      });
    }

    prevRunLastId = lastNodeId;
    rowY += groupH + RGAP;
  }

  return { nodes, edges };
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

const ROLE_STYLES: Record<string, { label: string; self: boolean; bg: string; text: string }> = {
  system:    { label: 'SYSTEM',    self: false, bg: 'bg-zinc-100 dark:bg-zinc-800',        text: 'text-zinc-600 dark:text-zinc-400' },
  user:      { label: 'USER',      self: false, bg: 'bg-blue-50 dark:bg-blue-950/50',      text: 'text-blue-800 dark:text-blue-200' },
  assistant: { label: 'ASSISTANT', self: true,  bg: 'bg-indigo-50 dark:bg-indigo-950/50',  text: 'text-indigo-800 dark:text-indigo-200' },
  tool:      { label: 'TOOL',      self: false, bg: 'bg-amber-50 dark:bg-amber-950/50',    text: 'text-amber-800 dark:text-amber-200' },
};

function ChatBubble({ role, content }: { role: string; content: string }) {
  const [expanded, setExpanded] = useState(content.length < 600);
  const s = ROLE_STYLES[role] ?? ROLE_STYLES.user;

  return (
    <div className={clsx('rounded-lg overflow-hidden text-xs', s.bg)}>
      <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-black/5 dark:border-white/5">
        <span className={clsx('font-mono font-bold tracking-widest text-[10px]', s.text)}>{s.label}</span>
        {content.length >= 600 && (
          <button
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-[10px]"
            onClick={() => setExpanded((p) => !p)}
          >
            {expanded ? 'collapse' : `expand (${content.length} chars)`}
          </button>
        )}
      </div>
      <pre className={clsx('px-2.5 py-2 prompt-content leading-relaxed whitespace-pre-wrap break-words', s.text, !expanded && 'line-clamp-4')}>
        {content}
      </pre>
    </div>
  );
}

function DetailPanel({ event, runIdx, onClose }: { event: RunEvent; runIdx: number; onClose: () => void }) {
  const cfg = EVENT_CFG[event.event_type] ?? fallbackCfg;

  return (
    <div className="w-[380px] max-h-[calc(100vh-160px)] flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 backdrop-blur shadow-2xl shadow-black/20 dark:shadow-black/50 overflow-hidden">
      {/* Header */}
      <div className={clsx('px-4 py-3 flex items-center gap-2.5 border-b border-zinc-100 dark:border-zinc-800', cfg.bg)}>
        <span className={clsx('w-2.5 h-2.5 rounded-full flex-shrink-0', cfg.dot)} />
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
          {cfg.label}
        </span>
        <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate flex-1">
          {event.node_name}
        </span>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {(
            [
              ['Run', `#${runIdx + 1}`],
              ['Time', new Date(event.timestamp).toLocaleTimeString()],
              ['Date', formatDate(event.timestamp)],
              event.latency_ms != null ? ['Latency', formatDuration(event.latency_ms)] : null,
              event.model ? ['Model', event.model.replace('claude-', '')] : null,
              event.input_tokens != null ? ['Input tokens', event.input_tokens.toLocaleString()] : null,
              event.output_tokens != null ? ['Output tokens', event.output_tokens?.toLocaleString()] : null,
            ] as (string[] | null)[]
          )
            .filter((x): x is string[] => x !== null)
            .map(([k, v]) => (
              <div key={k} className="contents">
                <span className="text-zinc-400">{k}</span>
                <span className="text-zinc-700 dark:text-zinc-300 font-mono text-right truncate">{v}</span>
              </div>
            ))}
        </div>

        {/* Latency bar */}
        {event.latency_ms != null && (
          <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, (event.latency_ms / 10000) * 100)}%`,
                background: `var(--tw-gradient-from, #6366f1)`,
                backgroundImage: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
              }}
            />
          </div>
        )}

        {/* Error */}
        {event.error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 px-3 py-2">
            <p className="text-[11px] font-mono text-red-700 dark:text-red-300 whitespace-pre-wrap break-words">
              {event.error}
            </p>
          </div>
        )}

        {/* LLM conversation */}
        {(event.llm_input?.length || event.llm_output) && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Conversation</p>
            {event.llm_input?.map((msg, i) => (
              <ChatBubble key={i} role={msg.role} content={msg.content} />
            ))}
            {event.llm_output && <ChatBubble role="assistant" content={event.llm_output} />}
          </div>
        )}

        {/* Tool payload */}
        {event.payload && Object.keys(event.payload).length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Payload</p>
            <pre className="prompt-content text-[11px] text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700 rounded-lg p-3 overflow-auto max-h-48">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Footer: link to full run */}
      <div className="px-4 py-2.5 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <span className="font-mono text-[10px] text-zinc-400">{new Date(event.timestamp).toLocaleTimeString()}</span>
        <Link
          to={`/runs/${event.run_id}`}
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium transition-colors"
        >
          Open full run →
        </Link>
      </div>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend({ hidden, onToggle }: { hidden: Set<string>; onToggle: (t: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {Object.entries(EVENT_CFG).map(([key, cfg]) => (
        <button
          key={key}
          onClick={() => onToggle(key)}
          className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all duration-150',
            hidden.has(key)
              ? 'opacity-40 border-zinc-200 dark:border-zinc-700 text-zinc-400'
              : `${cfg.bg} ${cfg.border} text-zinc-700 dark:text-zinc-300`
          )}
        >
          <span className={clsx('w-1.5 h-1.5 rounded-full', cfg.dot)} />
          {cfg.label}
        </button>
      ))}
    </div>
  );
}

// ─── Custom node types ────────────────────────────────────────────────────────

const nodeTypes = {
  eventNode: EventNode,
  runGroup: RunGroupNode,
};

// ─── Main component ───────────────────────────────────────────────────────────

export function ConversationGraph({ runs }: { runs: RunWithEvents[] }) {
  const { isDark } = useTheme();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedEvent, setSelectedEvent] = useState<{ event: RunEvent; runIdx: number } | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

  // Build layout when runs change
  useEffect(() => {
    if (runs.length === 0) return;
    const { nodes: n, edges: e } = buildLayout(runs);
    setNodes(n);
    setEdges(e);
  }, [runs]);

  // Apply visibility when filter changes
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.type === 'eventNode') {
          const ev = n.data.event as RunEvent;
          return { ...n, hidden: hiddenTypes.has(ev.event_type) } as Node;
        }
        return n;
      })
    );
  }, [hiddenTypes]);

  const handleNodeClick = useCallback(
    (_evt: React.MouseEvent, node: Node) => {
      if (node.type !== 'eventNode') return;
      const event = node.data.event as RunEvent;
      const runIdx = node.data.runIdx as number;
      setSelectedEvent((prev) =>
        prev?.event === event ? null : { event, runIdx }
      );
    },
    []
  );

  const toggleType = useCallback((type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }, []);

  const statsLine = useMemo(() => {
    const totalEvents = runs.reduce((s, r) => s + r.events.length, 0);
    const totalCost = runs.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0);
    return { totalEvents, totalCost };
  }, [runs]);

  if (runs.length === 0) {
    return (
      <div className="h-[600px] flex items-center justify-center text-zinc-400 dark:text-zinc-600 text-sm">
        No runs in this thread
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800" style={{ height: 680 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        colorMode={isDark ? 'dark' : 'light'}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        onPaneClick={() => setSelectedEvent(null)}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={isDark ? '#27272a' : '#e4e4e7'}
        />

        <Controls
          showInteractive={false}
          className="!border-zinc-200 dark:!border-zinc-700 !shadow-none !rounded-xl overflow-hidden"
        />

        <MiniMap
          nodeColor={(n) => {
            if (n.type === 'runGroup') return isDark ? '#18181b' : '#f4f4f5';
            const ev = n.data?.event as RunEvent | undefined;
            if (!ev) return '#71717a';
            return (EVENT_CFG[ev.event_type] ?? fallbackCfg).minimap;
          }}
          maskColor={isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)'}
          className="!border-zinc-200 dark:!border-zinc-700 !rounded-xl !shadow-none"
          pannable
          zoomable
        />

        {/* Top toolbar */}
        <Panel position="top-left">
          <div className="flex items-center gap-3 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border border-zinc-200 dark:border-zinc-700 rounded-xl px-3.5 py-2 shadow-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                {runs.length} runs
              </span>
              <span className="text-zinc-300 dark:text-zinc-700">·</span>
              <span className="text-xs text-zinc-500">{statsLine.totalEvents} events</span>
              {statsLine.totalCost > 0 && (
                <>
                  <span className="text-zinc-300 dark:text-zinc-700">·</span>
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    {formatCost(statsLine.totalCost)}
                  </span>
                </>
              )}
            </div>
            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700" />
            <Legend hidden={hiddenTypes} onToggle={toggleType} />
          </div>
        </Panel>

        {/* Detail panel */}
        {selectedEvent && (
          <Panel position="top-right" style={{ margin: 0 }}>
            <DetailPanel
              event={selectedEvent.event}
              runIdx={selectedEvent.runIdx}
              onClose={() => setSelectedEvent(null)}
            />
          </Panel>
        )}
      </ReactFlow>

      {/* Click hint */}
      {!selectedEvent && nodes.filter((n) => n.type === 'eventNode').length > 0 && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur opacity-60">
            Click any node to inspect · Scroll to zoom · Drag to pan
          </div>
        </div>
      )}
    </div>
  );
}
