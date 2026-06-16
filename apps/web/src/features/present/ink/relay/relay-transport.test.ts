// WI-240 Phase 2 — relay transport plumbing (fake socket + manual scheduler).

import { describe, expect, it, vi } from "vitest";
import { createRelayTransport, type RelaySocketLike } from "./relay-transport.js";

function fakeSocket() {
  const sent: string[] = [];
  const s: RelaySocketLike = {
    send: (d) => sent.push(d),
    close: vi.fn(),
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
  };
  return {
    s,
    sent,
    open: () => s.onopen?.(),
    drop: () => s.onclose?.(),
    deliver: (data: string) => s.onmessage?.({ data }),
  };
}

describe("createRelayTransport", () => {
  it("appends ?room and connects via the injected factory", () => {
    const made: string[] = [];
    const t = createRelayTransport({
      url: "wss://h/relay",
      room: "r1",
      createSocket: (url) => {
        made.push(url);
        return fakeSocket().s;
      },
    });
    expect(made).toEqual(["wss://h/relay?room=r1"]);
    expect(t.status()).toBe("connecting");
    t.close();
  });

  it("sends only when open; drops otherwise", () => {
    const f = fakeSocket();
    const t = createRelayTransport({ url: "wss://h/relay", room: "r", createSocket: () => f.s });
    t.send("early"); // not open yet → dropped
    expect(f.sent).toEqual([]);
    f.open();
    expect(t.status()).toBe("open");
    t.send("now");
    expect(f.sent).toEqual(["now"]);
    t.close();
  });

  it("delivers inbound messages to listeners", () => {
    const f = fakeSocket();
    const got: string[] = [];
    const t = createRelayTransport({ url: "wss://h/relay", room: "r", createSocket: () => f.s });
    t.onMessage((m) => got.push(m));
    f.open();
    f.deliver("hello");
    expect(got).toEqual(["hello"]);
    t.close();
  });

  it("reconnects with capped backoff on close, via the injected scheduler", () => {
    const sockets: ReturnType<typeof fakeSocket>[] = [];
    const scheduled: Array<{ fn: () => void; ms: number }> = [];
    const t = createRelayTransport({
      url: "wss://h/relay",
      room: "r",
      minBackoffMs: 500,
      maxBackoffMs: 2000,
      createSocket: () => {
        const f = fakeSocket();
        sockets.push(f);
        return f.s;
      },
      schedule: (fn, ms) => {
        scheduled.push({ fn, ms });
        return () => {};
      },
    });
    sockets[0]?.open();
    sockets[0]?.drop();
    expect(t.status()).toBe("reconnecting");
    expect(scheduled[0]?.ms).toBe(500);
    scheduled[0]?.fn(); // run the retry → new socket
    expect(sockets.length).toBe(2);
    sockets[1]?.drop();
    expect(scheduled[1]?.ms).toBe(1000); // backoff doubled
    t.close();
  });

  it("close() disposes and stops reconnecting", () => {
    const f = fakeSocket();
    const scheduled: Array<() => void> = [];
    const t = createRelayTransport({
      url: "wss://h/relay",
      room: "r",
      createSocket: () => f.s,
      schedule: (fn) => {
        scheduled.push(fn);
        return () => {};
      },
    });
    f.open();
    t.close();
    expect(t.status()).toBe("closed");
    expect(f.s.close).toHaveBeenCalled();
    f.drop(); // a late close event must not schedule a retry
    expect(scheduled.length).toBe(0);
  });
});
