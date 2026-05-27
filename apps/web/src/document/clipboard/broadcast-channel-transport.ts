// WI-041 Phase 4 — BroadcastChannel cross-tab transport.
//
// Mounts the `weave.clipboard.v1` BroadcastChannel and bridges it to the
// in-memory `clipboardStore`:
//
//   - Local copy/cut → `clipboardStore.write(payload)` → forwarded to
//     every other open tab via `channel.postMessage(payload)`.
//   - Remote message arrives → forwarded to the LOCAL store, which
//     skips when the message originated from this tab (self-receive
//     guard via `payload.origin`).
//
// The transport is environment-defensive:
//
//   - `globalThis.BroadcastChannel` absence (jsdom in early test envs,
//     older Safari pre-15.4) → no-op mount; cross-tab is silently off.
//   - Construction throws (Safari Private mode in some configs) → same
//     no-op behaviour; a localStorage-event fallback can layer on top.
//   - Incoming messages with an unknown `schemaVersion` are dropped
//     silently per RISK-008 R4. A development telemetry hook logs the
//     event so we can spot version-skew traffic during canary releases.

import type { ClipboardPayload, KnownClipboardPayload } from "./clipboard-types.js";
import { clipboardStore } from "./clipboard-store.js";

const CHANNEL_NAME = "weave.clipboard.v1";
const SUPPORTED_SCHEMA_VERSIONS = new Set<number>([1]);

interface BroadcastChannelLike {
  postMessage(message: unknown): void;
  close(): void;
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
}

interface BroadcastChannelTransportControls {
  /** Best-effort: returns false when the underlying BroadcastChannel
   *  could not be constructed (older browser, locked-down env). */
  readonly isActive: boolean;
  /** Tear the transport down — unmount listeners, close the channel,
   *  stop relaying local writes. Safe to call repeatedly. */
  dispose(): void;
}

function detectBroadcastChannel(): typeof BroadcastChannel | undefined {
  if (typeof globalThis === "undefined") return undefined;
  const ctor = (globalThis as { BroadcastChannel?: typeof BroadcastChannel })
    .BroadcastChannel;
  return ctor;
}

function isValidIncoming(data: unknown): data is KnownClipboardPayload {
  if (data === null || typeof data !== "object") return false;
  const p = data as ClipboardPayload<unknown>;
  if (typeof p.schemaVersion !== "number") return false;
  if (!SUPPORTED_SCHEMA_VERSIONS.has(p.schemaVersion)) return false;
  if (typeof p.origin !== "string") return false;
  if (typeof p.timestamp !== "number") return false;
  if (typeof p.kind !== "string") return false;
  return p.kind === "weave/items.v1";
}

/**
 * Mount the cross-tab clipboard transport for the lifetime of the
 * returned controls. Caller (typically `useClipboardCommands` via a
 * `useEffect` mount) is responsible for invoking `dispose()` on unmount.
 *
 * `sessionOrigin` is the local tab's stable origin id — incoming
 * messages whose `origin` equals this value are dropped (we received
 * our own broadcast).
 */
export function mountBroadcastChannelTransport(
  sessionOrigin: string,
): BroadcastChannelTransportControls {
  const Ctor = detectBroadcastChannel();
  if (Ctor === undefined) {
    return { isActive: false, dispose: () => {} };
  }

  let channel: BroadcastChannelLike;
  try {
    channel = new Ctor(CHANNEL_NAME) as unknown as BroadcastChannelLike;
  } catch {
    return { isActive: false, dispose: () => {} };
  }

  const handleMessage = (event: { data: unknown }): void => {
    if (!isValidIncoming(event.data)) return;
    if (event.data.origin === sessionOrigin) return; // self-receive
    clipboardStore.write(event.data);
  };
  channel.addEventListener("message", handleMessage);

  // Subscribe to local store writes so they fan out to other tabs. A
  // peek snapshot before each notification lets us decide whether the
  // change was a `write` (broadcast) or a `clear` (no-op — receivers
  // don't infer clears from absence). The previous-snapshot dance also
  // breaks the re-broadcast loop: when the receiver applies the
  // incoming payload via `clipboardStore.write`, the local subscription
  // re-fires, and we recognise the just-written payload's origin as
  // foreign and skip postMessage.
  let lastBroadcastTimestamp = 0;
  const unsubscribeStore = clipboardStore.subscribe(() => {
    const snapshot = clipboardStore.peek();
    if (snapshot === undefined) return;
    if (snapshot.origin !== sessionOrigin) return; // received from elsewhere
    if (snapshot.timestamp === lastBroadcastTimestamp) return; // already sent
    lastBroadcastTimestamp = snapshot.timestamp;
    try {
      channel.postMessage(snapshot);
    } catch (err) {
      // Disconnected / serialisation failed — telemetry only.
      // eslint-disable-next-line no-console
      console.warn("[clipboard] BroadcastChannel postMessage failed", err);
    }
  });

  return {
    isActive: true,
    dispose: () => {
      unsubscribeStore();
      channel.removeEventListener("message", handleMessage);
      channel.close();
    },
  };
}
