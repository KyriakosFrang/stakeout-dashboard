export function formatCost(eur: number | undefined | null): string {
  if (eur == null) return '—';
  if (eur === 0) return '€0.00';
  if (eur < 0.001) return `€${eur.toFixed(6)}`;
  if (eur < 0.01) return `€${eur.toFixed(4)}`;
  if (eur < 1) return `€${eur.toFixed(3)}`;
  return `€${eur.toFixed(2)}`;
}

export function formatDuration(ms: number | undefined | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function formatTokens(n: number | undefined | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 5000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function runDurationMs(run: { started_at: string; ended_at: string | null }): number | null {
  if (!run.ended_at) return null;
  return new Date(run.ended_at).getTime() - new Date(run.started_at).getTime();
}

export function truncateId(id: string, len = 8): string {
  return id.slice(0, len);
}
