export type Status = 'connecting' | 'online' | 'offline';

type MessageHandler = (msg: any) => void;

/**
 * 与服务端保持长连接的薄封装：负责自动重连、状态广播、消息订阅。
 */
export class Connection {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private openHandlers = new Set<() => void>();
  private statusHandlers = new Set<(status: Status) => void>();
  private retries = 0;
  private manuallyClosed = false;
  private reconnectTimer: number | null = null;

  status: Status = 'offline';

  constructor(private readonly url: string) {}

  on(type: string, fn: MessageHandler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn);
    return () => {
      set?.delete(fn);
    };
  }

  onOpen(fn: () => void): () => void {
    this.openHandlers.add(fn);
    return () => {
      this.openHandlers.delete(fn);
    };
  }

  onStatus(fn: (status: Status) => void): () => void {
    this.statusHandlers.add(fn);
    return () => {
      this.statusHandlers.delete(fn);
    };
  }

  private setStatus(status: Status) {
    if (this.status === status) return;
    this.status = status;
    this.statusHandlers.forEach((fn) => fn(status));
  }

  connect() {
    this.manuallyClosed = false;
    this.setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;
      this.setStatus('online');
      this.openHandlers.forEach((fn) => fn());
    };

    ws.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }
      this.handlers.get(msg.t)?.forEach((fn) => fn(msg));
      this.handlers.get('*')?.forEach((fn) => fn(msg));
    };

    ws.onclose = () => {
      this.ws = null;
      this.setStatus('offline');
      if (!this.manuallyClosed) this.scheduleReconnect();
    };

    ws.onerror = () => {
      /* onclose 会接管后续处理 */
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return;
    const delay = Math.min(800 * 2 ** this.retries, 8000);
    this.retries += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manuallyClosed) this.connect();
    }, delay);
  }

  send(payload: unknown): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  close() {
    this.manuallyClosed = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}

export function connectionUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}
