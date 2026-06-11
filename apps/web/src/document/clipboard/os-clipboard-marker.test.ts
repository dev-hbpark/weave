// WI-186 — OS-clipboard marker health + paste-event marker detection.
// WI-187 — cross-tab health transport.
// WI-188 — HTML stamp build / payload extraction.
//
// The routing CONSEQUENCES (keydown yield, native-paste dispatch) live in
// the e2e layer (`e2e/clipboard-os-marker.spec.ts`); this file pins the
// marker module's own contract: health transitions, the synchronous marker
// check, the payload round-trip, and the health broadcast.

import { afterEach, describe, expect, it } from "vitest";
import type { KnownClipboardPayload } from "./clipboard-types.js";
import {
  __resetOsClipboardMarkerForTests,
  buildMarkerHtml,
  clipboardEventHasOsMarker,
  extractOsClipboardPayload,
  MAX_OS_PAYLOAD_CHARS,
  mountMarkerHealthTransport,
  osMarkerRoutingActive,
  WEAVE_OS_CLIPBOARD_MARKER,
  writeOsClipboardMarker,
} from "./os-clipboard-marker.js";

interface ClipboardStub {
  readonly writeText?: (text: string) => Promise<void>;
  readonly write?: (items: unknown[]) => Promise<void>;
}

/** Install a fake `navigator.clipboard` for one test. */
function stubClipboard(impl: ClipboardStub | undefined): () => void {
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    value: impl,
    configurable: true,
  });
  return () => {
    if (original === undefined) {
      // jsdom has no own `clipboard` descriptor by default — remove ours.
      delete (navigator as unknown as Record<string, unknown>).clipboard;
      return;
    }
    Object.defineProperty(navigator, "clipboard", original);
  };
}

/** jsdom has no ClipboardItem — install a minimal recorder for one test. */
function stubClipboardItem(): () => void {
  class FakeClipboardItem {
    readonly items: Record<string, Blob>;
    constructor(items: Record<string, Blob>) {
      this.items = items;
    }
  }
  (globalThis as Record<string, unknown>).ClipboardItem = FakeClipboardItem;
  return () => {
    delete (globalThis as Record<string, unknown>).ClipboardItem;
  };
}

/** Let the fire-and-forget write's `.then` settle. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function fakePasteEvent(text: string | undefined, html = ""): ClipboardEvent {
  return {
    clipboardData:
      text === undefined && html === ""
        ? null
        : {
            getData: (type: string) =>
              type === "text/plain" ? (text ?? "") : type === "text/html" ? html : "",
          },
  } as unknown as ClipboardEvent;
}

function makePayload(overrides: Partial<KnownClipboardPayload> = {}): KnownClipboardPayload {
  return {
    schemaVersion: 1,
    appVersion: "test",
    origin: "tab-a",
    timestamp: 1718000000000,
    kind: "weave/items.v1",
    data: {
      item: {
        id: "i1",
        kind: "text",
        attrs: { text: "한글 + emoji 🎨 round-trip" },
        units: [],
        children: [],
        meta: {
          createdAt: "2026-06-12T00:00:00Z",
          updatedAt: "2026-06-12T00:00:00Z",
          schemaVersion: 1,
        },
      },
      relations: [],
    },
    ...overrides,
  } as KnownClipboardPayload;
}

afterEach(() => {
  __resetOsClipboardMarkerForTests();
});

describe("WI-186 — osMarkerRoutingActive health transitions (text-fallback path)", () => {
  // jsdom has no ClipboardItem, so writeOsClipboardMarker exercises the
  // legacy writeText fallback in these tests — exactly the degraded path
  // the health contract guards.
  it("is inactive before any write", () => {
    expect(osMarkerRoutingActive()).toBe(false);
  });

  it("activates after a successful writeText", async () => {
    const restore = stubClipboard({ writeText: () => Promise.resolve() });
    try {
      writeOsClipboardMarker();
      await flush();
      expect(osMarkerRoutingActive()).toBe(true);
    } finally {
      restore();
    }
  });

  it("stays inactive when writeText rejects", async () => {
    const restore = stubClipboard({ writeText: () => Promise.reject(new Error("denied")) });
    try {
      writeOsClipboardMarker();
      await flush();
      expect(osMarkerRoutingActive()).toBe(false);
    } finally {
      restore();
    }
  });

  it("flips back to inactive when a later write fails (stale marker is not a recency oracle)", async () => {
    let fail = false;
    const restore = stubClipboard({
      writeText: () => (fail ? Promise.reject(new Error("blurred")) : Promise.resolve()),
    });
    try {
      writeOsClipboardMarker();
      await flush();
      expect(osMarkerRoutingActive()).toBe(true);
      fail = true;
      writeOsClipboardMarker();
      await flush();
      expect(osMarkerRoutingActive()).toBe(false);
    } finally {
      restore();
    }
  });

  it("marks failed immediately when the clipboard API is missing", () => {
    const restore = stubClipboard(undefined);
    try {
      writeOsClipboardMarker();
      expect(osMarkerRoutingActive()).toBe(false);
    } finally {
      restore();
    }
  });
});

describe("WI-188 — rich text/html write path", () => {
  it("writes the HTML stamp (marker + payload attrs) via clipboard.write", async () => {
    const written: unknown[][] = [];
    const restoreItem = stubClipboardItem();
    const restore = stubClipboard({
      write: (items) => {
        written.push(items);
        return Promise.resolve();
      },
      writeText: () => Promise.reject(new Error("must not fall back")),
    });
    try {
      writeOsClipboardMarker(makePayload());
      await flush();
      expect(osMarkerRoutingActive()).toBe(true);
      expect(written).toHaveLength(1);
      const item = written[0]?.[0] as { items: Record<string, Blob> };
      const html = await item.items["text/html"]?.text();
      expect(html).toContain('data-weave-clipboard="v1"');
      expect(html).toContain("data-weave-payload=");
    } finally {
      restore();
      restoreItem();
    }
  });

  it("falls back to the legacy text marker when clipboard.write rejects", async () => {
    const texts: string[] = [];
    const restoreItem = stubClipboardItem();
    const restore = stubClipboard({
      write: () => Promise.reject(new Error("flavor unsupported")),
      writeText: (t) => {
        texts.push(t);
        return Promise.resolve();
      },
    });
    try {
      writeOsClipboardMarker(makePayload());
      await flush();
      await flush();
      expect(texts).toEqual([WEAVE_OS_CLIPBOARD_MARKER]);
      expect(osMarkerRoutingActive()).toBe(true);
    } finally {
      restore();
      restoreItem();
    }
  });
});

describe("WI-188 — buildMarkerHtml / extractOsClipboardPayload", () => {
  it("round-trips a payload (unicode-safe) through the HTML stamp", () => {
    const payload = makePayload();
    const html = buildMarkerHtml(payload);
    const extracted = extractOsClipboardPayload(fakePasteEvent(undefined, html));
    expect(extracted).toEqual(payload);
  });

  it("survives Chromium's html/body re-wrapping of the written HTML", () => {
    const payload = makePayload();
    const wrapped = `<html><head><meta charset="utf-8"></head><body>${buildMarkerHtml(payload).replace('<meta charset="utf-8">', "")}</body></html>`;
    const e = fakePasteEvent(undefined, wrapped);
    expect(clipboardEventHasOsMarker(e)).toBe(true);
    expect(extractOsClipboardPayload(e)).toEqual(payload);
  });

  it("degrades to a marker-only stamp above MAX_OS_PAYLOAD_CHARS (detection true, extraction undefined)", () => {
    const payload = makePayload({
      data: {
        item: {
          id: "big",
          kind: "image",
          attrs: { src: `data:image/png;base64,${"x".repeat(MAX_OS_PAYLOAD_CHARS)}` },
          units: [],
          children: [],
          meta: {
            createdAt: "2026-06-12T00:00:00Z",
            updatedAt: "2026-06-12T00:00:00Z",
            schemaVersion: 1,
          },
        },
        relations: [],
      },
    } as Partial<KnownClipboardPayload>);
    const html = buildMarkerHtml(payload);
    expect(html).not.toContain("data-weave-payload");
    const e = fakePasteEvent(undefined, html);
    expect(clipboardEventHasOsMarker(e)).toBe(true);
    expect(extractOsClipboardPayload(e)).toBeUndefined();
  });

  it("returns undefined for an unknown schemaVersion (RISK-008 R4)", () => {
    const payload = makePayload({ schemaVersion: 99 as unknown as 1 });
    const html = buildMarkerHtml(payload);
    expect(extractOsClipboardPayload(fakePasteEvent(undefined, html))).toBeUndefined();
  });

  it("returns undefined for corrupt base64 / foreign HTML", () => {
    const corrupt = `<span data-weave-clipboard="v1" data-weave-payload="@@not-base64@@"></span>`;
    expect(extractOsClipboardPayload(fakePasteEvent(undefined, corrupt))).toBeUndefined();
    expect(extractOsClipboardPayload(fakePasteEvent(undefined, "<p>hello</p>"))).toBeUndefined();
  });
});

describe("WI-186/188 — clipboardEventHasOsMarker", () => {
  it("detects the legacy marker in text/plain", () => {
    expect(clipboardEventHasOsMarker(fakePasteEvent(WEAVE_OS_CLIPBOARD_MARKER))).toBe(true);
  });

  it("detects the HTML stamp in text/html", () => {
    expect(clipboardEventHasOsMarker(fakePasteEvent(undefined, buildMarkerHtml()))).toBe(true);
  });

  it("rejects other text", () => {
    expect(clipboardEventHasOsMarker(fakePasteEvent("hello"))).toBe(false);
  });

  it("rejects an event without clipboardData", () => {
    expect(clipboardEventHasOsMarker(fakePasteEvent(undefined))).toBe(false);
  });
});

describe("WI-187 — cross-tab marker-health transport", () => {
  /** Minimal same-process BroadcastChannel fake: every instance with the
   *  same name receives posts from OTHER instances (matching the platform's
   *  no-self-delivery contract). */
  function stubBroadcastChannel(): () => void {
    const instances = new Set<FakeChannel>();
    class FakeChannel {
      readonly name: string;
      private listeners = new Set<(e: { data: unknown }) => void>();
      constructor(name: string) {
        this.name = name;
        instances.add(this);
      }
      postMessage(data: unknown): void {
        for (const other of instances) {
          if (other === this || other.name !== this.name) continue;
          for (const l of other.listeners) l({ data });
        }
      }
      addEventListener(_t: "message", l: (e: { data: unknown }) => void): void {
        this.listeners.add(l);
      }
      removeEventListener(_t: "message", l: (e: { data: unknown }) => void): void {
        this.listeners.delete(l);
      }
      close(): void {
        instances.delete(this);
      }
    }
    const g = globalThis as Record<string, unknown>;
    const original = g.BroadcastChannel;
    g.BroadcastChannel = FakeChannel;
    return () => {
      if (original === undefined) delete g.BroadcastChannel;
      else g.BroadcastChannel = original;
    };
  }

  it("adopts a valid remote health message and ignores invalid ones", () => {
    const restoreBC = stubBroadcastChannel();
    const dispose = mountMarkerHealthTransport();
    try {
      const Ctor = (globalThis as { BroadcastChannel?: new (name: string) => BroadcastChannel })
        .BroadcastChannel;
      if (Ctor === undefined) throw new Error("stub missing");
      const peer = new Ctor("weave.clipboard.marker-health.v1");
      peer.postMessage({ schemaVersion: 1, health: "ok" });
      expect(osMarkerRoutingActive()).toBe(true);
      peer.postMessage({ schemaVersion: 999, health: "failed" }); // dropped
      expect(osMarkerRoutingActive()).toBe(true);
      peer.postMessage({ schemaVersion: 1, health: "failed" }); // adopted
      expect(osMarkerRoutingActive()).toBe(false);
      peer.close();
    } finally {
      dispose();
      restoreBC();
    }
  });

  it("local transitions are broadcast to peers", async () => {
    const restoreBC = stubBroadcastChannel();
    const dispose = mountMarkerHealthTransport();
    const received: unknown[] = [];
    try {
      const Ctor = (globalThis as { BroadcastChannel?: new (name: string) => BroadcastChannel })
        .BroadcastChannel;
      if (Ctor === undefined) throw new Error("stub missing");
      const peer = new Ctor("weave.clipboard.marker-health.v1");
      peer.addEventListener("message", ((e: { data: unknown }) => {
        received.push(e.data);
      }) as unknown as EventListener);
      const restoreClipboard = stubClipboard({ writeText: () => Promise.resolve() });
      writeOsClipboardMarker();
      await flush();
      restoreClipboard();
      expect(received).toEqual([{ schemaVersion: 1, health: "ok" }]);
      peer.close();
    } finally {
      dispose();
      restoreBC();
    }
  });

  it("stops broadcasting after dispose", async () => {
    const restoreBC = stubBroadcastChannel();
    const dispose = mountMarkerHealthTransport();
    dispose();
    const restoreClipboard = stubClipboard({ writeText: () => Promise.resolve() });
    try {
      // No channel mounted — the write still resolves health locally.
      writeOsClipboardMarker();
      await flush();
      expect(osMarkerRoutingActive()).toBe(true);
    } finally {
      restoreClipboard();
      restoreBC();
    }
  });
});
