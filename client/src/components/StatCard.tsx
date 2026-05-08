import clsx from 'clsx';

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'default' | 'green' | 'red' | 'blue' | 'amber';
  icon?: React.ReactNode;
}

const accentMap = {
  default: 'text-zinc-900 dark:text-zinc-100',
  green: 'text-emerald-600 dark:text-emerald-400',
  red: 'text-red-600 dark:text-red-400',
  blue: 'text-blue-600 dark:text-blue-400',
  amber: 'text-amber-600 dark:text-amber-400',
};

export function StatCard({ label, value, sub, accent = 'default', icon }: Props) {
  return (
    <div className="card p-4 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{label}</span>
        {icon && <span className="text-zinc-400 dark:text-zinc-600">{icon}</span>}
      </div>
      <div className={clsx('text-2xl font-bold tabular-nums leading-tight', accentMap[accent])}>{value}</div>
      {sub && <div className="text-xs text-zinc-400 dark:text-zinc-500">{sub}</div>}
    </div>
  );
}
