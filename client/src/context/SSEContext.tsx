import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import type { Run } from '../types';

interface SSEContextValue {
  connected: boolean;
  activeRuns: number;
  recentUpdates: Run[];
  subscribe: (listener: (runs: Run[]) => void) => () => void;
}

const SSEContext = createContext<SSEContextValue>({
  connected: false,
  activeRuns: 0,
  recentUpdates: [],
  subscribe: () => () => undefined,
});

export function SSEProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [activeRuns, setActiveRuns] = useState(0);
  const [recentUpdates, setRecentUpdates] = useState<Run[]>([]);
  const listenersRef = useRef<Set<(runs: Run[]) => void>>(new Set());

  useEffect(() => {
    let es: EventSource;
    let retryTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      es = new EventSource('/api/stream');

      es.addEventListener('connected', () => {
        setConnected(true);
      });

      es.addEventListener('runs_updated', (e: MessageEvent) => {
        try {
          const runs: Run[] = JSON.parse(e.data);
          const running = runs.filter((r) => r.status === 'running').length;
          setActiveRuns(running);
          setRecentUpdates(runs.slice(0, 10));
          listenersRef.current.forEach((fn) => fn(runs));
        } catch {
          // ignore parse errors
        }
      });

      es.onerror = () => {
        setConnected(false);
        es.close();
        retryTimeout = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      clearTimeout(retryTimeout);
      es?.close();
    };
  }, []);

  const subscribe = (listener: (runs: Run[]) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  };

  return (
    <SSEContext.Provider value={{ connected, activeRuns, recentUpdates, subscribe }}>
      {children}
    </SSEContext.Provider>
  );
}

export function useSSEContext() {
  return useContext(SSEContext);
}
