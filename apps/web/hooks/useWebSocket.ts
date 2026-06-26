import { useEffect, useRef, useCallback } from "react";

type MessageHandler = (data: unknown) => void;

export function useWebSocket(
  streamId: string | null,
  onMessage: MessageHandler,
) {
  const wsRef = useRef<WebSocket | null>(null);

  const send = useCallback((payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  useEffect(() => {
    if (!streamId) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";
    const ws = new WebSocket(`${wsUrl}/ws?streamId=${streamId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch {
      }
    };

    ws.onerror = (err) => console.error("WebSocket error:", err);

    return () => {
      ws.close();
    };
  }, [streamId]);

  return { send };
}
