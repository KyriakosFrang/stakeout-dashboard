import { useEffect, useRef } from 'react';

type SSEHandler = (event: MessageEvent) => void;

export function useSSE(url: string, handlers: Record<string, SSEHandler>): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let es: EventSource;
    let retryTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      es = new EventSource(url);

      Object.entries(handlersRef.current).forEach(([event, handler]) => {
        es.addEventListener(event, handler as EventListener);
      });

      es.onerror = () => {
        es.close();
        retryTimeout = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      clearTimeout(retryTimeout);
      es?.close();
    };
  }, [url]);
}
