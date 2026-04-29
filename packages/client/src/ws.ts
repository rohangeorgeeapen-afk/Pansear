import { useEffect, useState } from "react";
import type { ServerToClientMessage, StationQueue, ActiveOrderView } from "@restaurant/shared";

export interface QueueState {
  queues: StationQueue[];
  orders: ActiveOrderView[];
}

export function useQueueState(): QueueState | null {
  const [state, setState] = useState<QueueState | null>(null);

  useEffect(() => {
    const wsUrl = `ws://${window.location.hostname}:3001`;
    let ws: WebSocket | null = null;
    let cancelled = false;

    function connect() {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as ServerToClientMessage;
          if (msg.type === "queue_update") setState(msg.payload);
        } catch (err) {
          console.error("bad ws message", err);
        }
      };
      ws.onclose = () => {
        if (!cancelled) setTimeout(connect, 1000);
      };
    }
    connect();
    return () => { cancelled = true; ws?.close(); };
  }, []);

  return state;
}
