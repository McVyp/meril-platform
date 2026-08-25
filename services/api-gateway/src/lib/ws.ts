import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { Server } from "http";

const rooms = new Map<string, Set<WebSocket>>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // URL format: /ws?streamId=xxx
    const url = new URL(req.url ?? "", `http://localhost`);
    const streamId = url.searchParams.get("streamId");

    if (!streamId) {
      ws.close(1008, "streamId required");
      return;
    }

    if (!rooms.has(streamId)) rooms.set(streamId, new Set());
    rooms.get(streamId)!.add(ws);

    broadcastToRoom(streamId, {
      type: "VIEWER_COUNT",
      streamId,
      count: rooms.get(streamId)!.size,
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === "CHAT") {
          broadcastToRoom(streamId, {
            type: "CHAT",
            streamId,
            message: msg.message,
            username: msg.username ?? "Guest",
          });
        }
      } catch {}
    });

    ws.on("close", () => {
      rooms.get(streamId)?.delete(ws);

      if (rooms.get(streamId)?.size === 0) {
        rooms.delete(streamId);
      } else {
        broadcastToRoom(streamId, {
          type: "VIEWER_COUNT",
          streamId,
          count: rooms.get(streamId)!.size,
        });
      }
    });
  });

  return wss;
}

export function broadcastToRoom(streamId: string, payload: object) {
  const room = rooms.get(streamId);
  if (!room) return;

  const msg = JSON.stringify(payload);
  for (const client of room) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

export function broadcastToAll(payload: object) {
  const msg = JSON.stringify(payload);
  for (const room of rooms.values()) {
    for (const client of room) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }
}
