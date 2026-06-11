// WI-186 — OS-clipboard marker health + paste-event marker detection.
//
// The routing CONSEQUENCES (keydown yield, native-paste dispatch) live in
// the e2e layer (`e2e/clipboard-os-marker.spec.ts`); this file pins the
// marker module's own contract: health transitions and the synchronous
// marker check.

import { afterEach, describe, expect, it } from "vitest";
import {
  __resetOsClipboardMarkerForTests,
  clipboardEventHasOsMarker,
  osMarkerRoutingActive,
  WEAVE_OS_CLIPBOARD_MARKER,
  writeOsClipboardMarker,
} from "./os-clipboard-marker.js";

/** Install a fake `navigator.clipboard.writeText` for one test. */
function stubWriteText(impl: (() => Promise<void>) | undefined): () => void {
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    value: impl === undefined ? undefined : { writeText: impl },
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

/** Let the fire-and-forget write's `.then` settle. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function fakePasteEvent(text: string | undefined): ClipboardEvent {
  return {
    clipboardData:
      text === undefined
        ? null
        : { getData: (type: string) => (type === "text/plain" ? text : "") },
  } as unknown as ClipboardEvent;
}

afterEach(() => {
  __resetOsClipboardMarkerForTests();
});

describe("WI-186 — osMarkerRoutingActive health transitions", () => {
  it("is inactive before any write", () => {
    expect(osMarkerRoutingActive()).toBe(false);
  });

  it("activates after a successful writeText", async () => {
    const restore = stubWriteText(() => Promise.resolve());
    try {
      writeOsClipboardMarker();
      await flush();
      expect(osMarkerRoutingActive()).toBe(true);
    } finally {
      restore();
    }
  });

  it("stays inactive when writeText rejects", async () => {
    const restore = stubWriteText(() => Promise.reject(new Error("denied")));
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
    const restore = stubWriteText(() =>
      fail ? Promise.reject(new Error("blurred")) : Promise.resolve(),
    );
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
    const restore = stubWriteText(undefined);
    try {
      writeOsClipboardMarker();
      expect(osMarkerRoutingActive()).toBe(false);
    } finally {
      restore();
    }
  });
});

describe("WI-186 — clipboardEventHasOsMarker", () => {
  it("detects the marker in text/plain", () => {
    expect(clipboardEventHasOsMarker(fakePasteEvent(WEAVE_OS_CLIPBOARD_MARKER))).toBe(true);
  });

  it("rejects other text", () => {
    expect(clipboardEventHasOsMarker(fakePasteEvent("hello"))).toBe(false);
  });

  it("rejects an event without clipboardData", () => {
    expect(clipboardEventHasOsMarker(fakePasteEvent(undefined))).toBe(false);
  });
});
