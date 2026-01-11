import type { FastifyInstance } from 'fastify';

type WsLike = {
  readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  on: (event: string, listener: (...args: any[]) => void) => void;
  ping?: () => void;
  terminate?: () => void;
  bufferedAmount?: number;
};

type WhiteboardClient = {
  socket: WsLike;
  clientId: string;
  userId: string;
  whiteboardId: string;
  lastSeen: number;
  heartbeat?: NodeJS.Timeout;
};

const WS_OPEN = 1;
const HEARTBEAT_INTERVAL_MS = 25000;
const HEARTBEAT_TIMEOUT_MS = 70000;
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;

export function createWhiteboardHub(app: FastifyInstance) {
  const rooms = new Map<string, Map<string, WhiteboardClient>>();

  const markAlive = (client: WhiteboardClient) => {
    client.lastSeen = Date.now();
  };

  const addClient = (client: WhiteboardClient) => {
    const room = rooms.get(client.whiteboardId) ?? new Map<string, WhiteboardClient>();
    room.set(client.clientId, client);
    rooms.set(client.whiteboardId, room);
    startHeartbeat(client);
  };

  const removeClient = (client: WhiteboardClient) => {
    stopHeartbeat(client);
    const room = rooms.get(client.whiteboardId);
    if (!room) return;
    room.delete(client.clientId);
    if (room.size === 0) {
      rooms.delete(client.whiteboardId);
    }
  };

  const safeSend = (client: WhiteboardClient, payload: string) => {
    if (client.socket.readyState !== WS_OPEN) {
      removeClient(client);
      return false;
    }
    if (typeof client.socket.bufferedAmount === 'number' && client.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      app.log.warn(
        {
          whiteboardId: client.whiteboardId,
          clientId: client.clientId,
          bufferedAmount: client.socket.bufferedAmount,
        },
        'whiteboard ws buffer high, dropping message'
      );
      return false;
    }
    try {
      client.socket.send(payload);
      return true;
    } catch {
      removeClient(client);
      return false;
    }
  };

  const broadcast = (whiteboardId: string, payload: string, excludeClientId?: string) => {
    const room = rooms.get(whiteboardId);
    if (!room) return;

    for (const [clientId, client] of room.entries()) {
      if (excludeClientId && clientId === excludeClientId) continue;
      safeSend(client, payload);
    }

    app.log.info(
      { whiteboardId, totalClients: room.size, excludeClientId },
      'whiteboard ws broadcast'
    );
  };

  const startHeartbeat = (client: WhiteboardClient) => {
    stopHeartbeat(client);
    client.lastSeen = Date.now();
    client.heartbeat = setInterval(() => {
      if (client.socket.readyState !== WS_OPEN) {
        removeClient(client);
        return;
      }

      const idleMs = Date.now() - client.lastSeen;
      if (idleMs > HEARTBEAT_TIMEOUT_MS) {
        try {
          if (client.socket.terminate) {
            client.socket.terminate();
          } else {
            client.socket.close(4000, 'heartbeat-timeout');
          }
        } catch {
          // ignore close errors
        } finally {
          removeClient(client);
        }
        return;
      }

      try {
        if (client.socket.ping) {
          client.socket.ping();
        } else {
          client.socket.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        }
      } catch {
        removeClient(client);
      }
    }, HEARTBEAT_INTERVAL_MS);
  };

  const stopHeartbeat = (client: WhiteboardClient) => {
    if (client.heartbeat) {
      clearInterval(client.heartbeat);
      client.heartbeat = undefined;
    }
  };

  return {
    addClient,
    removeClient,
    markAlive,
    broadcast,
    safeSend,
  };
}
