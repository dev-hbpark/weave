// WI-240 Phase 2 — thin WS client for the present live-session relay.
//
// Domain-neutral: it moves text to/from `wss://<host>/relay?room=<id>` and
// reconnects with capped backoff. It knows nothing about ink — the session
// layer encodes/decodes `SessionMessage`s on top. Messages sent while
// disconnected are dropped (ephemeral, best-effort — RISK-013 R5).
//
// A `WebSocket` factory is injectable so tests drive a fake socket without a
// network.

export type RelayStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface RelayTransport {
  send(text: string): void;
  onMessage(cb: (text: string) => void): () => void;
  onStatus(cb: (s: RelayStatus) => void): () => void;
  status(): RelayStatus;
  close(): void;
}

/** Minimal structural shape of the bits of WebSocket we use — lets a test
 *  inject a fake without the DOM lib. */
export interface RelaySocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export interface RelayTransportOptions {
  /** Base relay URL, e.g. `wss://host/relay`. The `?room=` is appended. */
  readonly url: string;
  readonly room: string;
  /** Factory for the socket; defaults to the global `WebSocket`. */
  readonly createSocket?: (url: string) => RelaySocketLike;
  /** Backoff bounds (ms). */
  readonly minBackoffMs?: number;
  readonly maxBackoffMs?: number;
  /** Scheduler seam (tests pass a manual timer). Defaults to setTimeout. */
  readonly schedule?: (fn: () => void, ms: number) => () => void;
}

function defaultCreateSocket(url: string): RelaySocketLike {
  return new WebSocket(url) as unknown as RelaySocketLike;
}

function defaultSchedule(fn: () => void, ms: number): () => void {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
}

export function createRelayTransport(opts: RelayTransportOptions): RelayTransport {
  const createSocket = opts.createSocket ?? defaultCreateSocket;
  const schedule = opts.schedule ?? defaultSchedule;
  const minBackoff = opts.minBackoffMs ?? 500;
  const maxBackoff = opts.maxBackoffMs ?? 8000;
  const fullUrl = `${opts.url}?room=${encodeURIComponent(opts.room)}`;

  const messageListeners = new Set<(text: string) => void>();
  const statusListeners = new Set<(s: RelayStatus) => void>();
  let status: RelayStatus = "connecting";
  let sock: RelaySocketLike | null = null;
  let backoff = minBackoff;
  let disposed = false;
  let cancelRetry: (() => void) | null = null;

  const setStatus = (next: RelayStatus): void => {
    if (status === next) return;
    status = next;
    for (const fn of statusListeners) fn(next);
  };

  const connect = (): void => {
    if (disposed) return;
    const s = createSocket(fullUrl);
    sock = s;
    s.onopen = () => {
      backoff = minBackoff;
      setStatus("open");
    };
    s.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        for (const fn of messageListeners) fn(ev.data);
      }
    };
    const onDown = () => {
      if (disposed) return;
      if (sock !== s) return; // a newer socket already took over
      sock = null;
      setStatus("reconnecting");
      cancelRetry = schedule(connect, backoff);
      backoff = Math.min(backoff * 2, maxBackoff);
    };
    s.onclose = onDown;
    s.onerror = onDown;
  };

  connect();

  return {
    send(text) {
      if (sock !== null && status === "open") {
        try {
          sock.send(text);
        } catch {
          // dropped — a reconnect is or will be in flight
        }
      }
    },
    onMessage(cb) {
      messageListeners.add(cb);
      return () => messageListeners.delete(cb);
    },
    onStatus(cb) {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    status: () => status,
    close() {
      disposed = true;
      cancelRetry?.();
      const s = sock;
      sock = null;
      setStatus("closed");
      if (s !== null) {
        s.onopen = null;
        s.onclose = null;
        s.onerror = null;
        s.onmessage = null;
        try {
          s.close();
        } catch {
          // ignore
        }
      }
    },
  };
}
