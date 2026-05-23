import type { BackendAdapter } from './BackendAdapter';
import { MongoAdapter } from './MongoAdapter';
import { PostgresAdapter } from './PostgresAdapter';

let _adapter: BackendAdapter | null = null;

export function getAdapter(): BackendAdapter {
  if (!_adapter) {
    const backend = (process.env.STAKEOUT_BACKEND || 'mongo').toLowerCase();
    if (backend === 'postgres') {
      _adapter = new PostgresAdapter();
    } else {
      _adapter = new MongoAdapter();
    }
  }
  return _adapter;
}

export async function initAdapter(): Promise<BackendAdapter> {
  const adapter = getAdapter();
  await adapter.connect();
  return adapter;
}

export async function closeAdapter(): Promise<void> {
  if (_adapter) {
    await _adapter.close();
    _adapter = null;
  }
}

export type { BackendAdapter };
