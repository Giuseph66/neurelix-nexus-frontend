export type WhiteboardSocketStatus = 'idle' | 'connecting' | 'open' | 'closed';

export type WhiteboardSnapshotMessage = {
  snapshot: unknown;
  version?: number;
  clientId?: string;
};

export type WhiteboardCommentEvent =
  | { type: 'comment.created'; comment: unknown }
  | { type: 'comment.updated'; comment: unknown }
  | { type: 'comment.deleted'; commentId: string };

export type WhiteboardSocketError = {
  type: string;
  message?: string;
  data?: unknown;
};

export interface WhiteboardSocketOptions {
  whiteboardId: string;
  clientId: string;
  getToken: () => string | null;
  getWsBaseUrl: () => string | null;
  heartbeatMs?: number;
  pongTimeoutMs?: number;
  maxBufferedBytes?: number;
  reconnectMaxDelayMs?: number;
}

export interface WhiteboardSocketHandlers {
  onSnapshot: (message: WhiteboardSnapshotMessage) => void;
  onAck?: (version: number) => void;
  onComment?: (event: WhiteboardCommentEvent) => void;
  onStatus?: (status: WhiteboardSocketStatus, detail?: { code?: number; reason?: string }) => void;
  onError?: (error: WhiteboardSocketError) => void;
}

export class WhiteboardSocket {
  private ws: WebSocket | null = null;
  private status: WhiteboardSocketStatus = 'idle';
  private manualClose = false;
  private reconnectAttempts = 0;
  private reconnectTimeout: number | null = null;
  private heartbeatInterval: number | null = null;
  private lastPongAt = 0;

  constructor(
    private options: WhiteboardSocketOptions,
    private handlers: WhiteboardSocketHandlers
  ) {}

  connect() {
    if (this.status === 'connecting' || this.status === 'open') return;
    this.manualClose = false;

    const token = this.options.getToken();
    const wsBase = this.options.getWsBaseUrl();
    if (!token || !wsBase) {
      this.setStatus('closed', { reason: 'missing-token-or-base' });
      return;
    }

    const wsUrl = `${wsBase}/ws/whiteboards/${this.options.whiteboardId}?token=${encodeURIComponent(token)}&clientId=${this.options.clientId}`;
    this.setStatus('connecting');

    const ws = new WebSocket(wsUrl);
    this.ws = ws;
    this.lastPongAt = Date.now();

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus('open');
      this.startHeartbeat();
    };

    ws.onmessage = (event) => {
      this.lastPongAt = Date.now();
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      this.handleMessage(data);
    };

    ws.onclose = (event) => {
      this.stopHeartbeat();
      if (this.ws === ws) {
        this.ws = null;
      }
      this.setStatus('closed', { code: event.code, reason: event.reason });
      if (!this.manualClose) {
        this.scheduleReconnect();
      }
    };

    ws.onerror = () => {
      this.handlers.onError?.({ type: 'ws-error' });
    };
  }

  disconnect() {
    this.manualClose = true;
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close(1000, 'client disconnect');
      } catch {
        // ignore close errors
      }
    }
    this.ws = null;
    this.setStatus('closed');
  }

  sendSnapshot(snapshot: unknown): { sent: boolean; reason?: string; bufferedAmount?: number } {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return { sent: false, reason: 'not-open' };
    }

    const maxBuffered = this.options.maxBufferedBytes ?? 2 * 1024 * 1024;
    if (typeof ws.bufferedAmount === 'number' && ws.bufferedAmount > maxBuffered) {
      return { sent: false, reason: 'buffered', bufferedAmount: ws.bufferedAmount };
    }

    try {
      ws.send(JSON.stringify({
        type: 'snapshot',
        snapshot,
        clientId: this.options.clientId,
      }));
      return { sent: true, bufferedAmount: ws.bufferedAmount };
    } catch (error) {
      this.handlers.onError?.({ type: 'send-failed', data: error });
      return { sent: false, reason: 'send-failed' };
    }
  }

  getStatus() {
    return this.status;
  }

  private setStatus(status: WhiteboardSocketStatus, detail?: { code?: number; reason?: string }) {
    this.status = status;
    this.handlers.onStatus?.(status, detail);
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout !== null || this.manualClose) return;
    const maxDelay = this.options.reconnectMaxDelayMs ?? 10000;
    const delay = Math.min(2000 * (this.reconnectAttempts + 1), maxDelay);
    this.reconnectAttempts += 1;
    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    const heartbeatMs = this.options.heartbeatMs ?? 20000;
    const pongTimeoutMs = this.options.pongTimeoutMs ?? 60000;
    this.heartbeatInterval = window.setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const idleMs = Date.now() - this.lastPongAt;
      if (idleMs > pongTimeoutMs) {
        try {
          ws.close(4000, 'heartbeat-timeout');
        } catch {
          // ignore close errors
        }
        return;
      }

      try {
        ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
      } catch (error) {
        this.handlers.onError?.({ type: 'ping-failed', data: error });
      }
    }, heartbeatMs);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private handleMessage(data: any) {
    if (data?.type === 'ping') {
      this.sendRaw({ type: 'pong', ts: Date.now() });
      return;
    }

    if (data?.type === 'pong') {
      return;
    }

    if (data?.type === 'ack' && typeof data.version === 'number') {
      this.handlers.onAck?.(data.version);
      return;
    }

    if (data?.type === 'comment.created' && data?.comment) {
      this.handlers.onComment?.({ type: 'comment.created', comment: data.comment });
      return;
    }

    if (data?.type === 'comment.updated' && data?.comment) {
      this.handlers.onComment?.({ type: 'comment.updated', comment: data.comment });
      return;
    }

    if (data?.type === 'comment.deleted' && data?.commentId) {
      this.handlers.onComment?.({ type: 'comment.deleted', commentId: String(data.commentId) });
      return;
    }

    if (data?.type === 'snapshot' && data?.snapshot) {
      this.handlers.onSnapshot({
        snapshot: data.snapshot,
        version: data.version,
        clientId: data.clientId ?? undefined,
      });
      return;
    }

    if (data?.type === 'error') {
      this.handlers.onError?.({
        type: 'server-error',
        message: typeof data.error === 'string' ? data.error : undefined,
        data,
      });
    }
  }

  private sendRaw(payload: Record<string, unknown>) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(payload));
    } catch (error) {
      this.handlers.onError?.({ type: 'send-raw-failed', data: error });
    }
  }
}
