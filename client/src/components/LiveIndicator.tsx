interface Props {
  connected: boolean;
  activeRuns?: number;
}

export function LiveIndicator({ connected, activeRuns = 0 }: Props) {
  if (!connected) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
        Reconnecting...
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <span className="text-emerald-600 dark:text-emerald-400 font-medium">Live</span>
      {activeRuns > 0 && (
        <span className="text-zinc-500">
          · {activeRuns} active {activeRuns === 1 ? 'run' : 'runs'}
        </span>
      )}
    </span>
  );
}
