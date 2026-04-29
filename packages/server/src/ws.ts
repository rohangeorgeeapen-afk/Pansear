import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { computeQueues } from "./state.js";
import type { ServerToClientMessage } from "@restaurant/shared";

let wss: WebSocketServer | null = null;

export function attachWss(server: Server) {
  wss = new WebSocketServer({ server });
  wss.on("connection", async (ws) => {
    try {
      const snapshot = await computeQueues();
      ws.send(JSON.stringify({ type: "queue_update", payload: snapshot } satisfies ServerToClientMessage));
    } catch (err) {
      console.error("ws initial snapshot failed", err);
    }
  });
}

export async function broadcastQueueUpdate() {
  if (!wss) return;
  const payload = await computeQueues();
  const msg = JSON.stringify({ type: "queue_update", payload } satisfies ServerToClientMessage);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}
