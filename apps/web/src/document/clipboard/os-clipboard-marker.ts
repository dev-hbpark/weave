// WI-186 — OS-clipboard weave marker (DR-122).
// WI-187 — cross-tab marker-health propagation (DR-123).
// WI-188 — HTML clipboard serialization, Figma-style (DR-124).
//
// Problem (WI-185 ⑰ residual): once a weave item is copied, the in-memory
// clipboard store stays non-empty for the rest of the session, so the
// keydown-time probe routed EVERY later Cmd+V to the internal paste — an
// OS-clipboard image copied AFTER the weave copy was unreachable.
//
// Fix: copying / cutting weave items also stamps the OS clipboard. Because
// every clipboard write REPLACES the OS clipboard wholesale, marker presence
// at paste time is a recency oracle:
//
//   marker present → the weave copy is the newest copy → internal paste wins
//   marker absent  → something else was copied since   → the OS payload wins
//
// Routing therefore moves from the keydown probe to the native `paste` event
// (the only place clipboard CONTENT is synchronously readable without an async
// permission prompt). The Cmd+V binding yields — no preventDefault — whenever
// marker routing is active, and the window paste router
// (`use-os-paste-routing`) decides internal vs OS by marker presence.
//
// Stamp format (WI-188): the preferred write is a `text/html` ClipboardItem —
// an empty `<span data-weave-clipboard="v1" data-weave-payload="…">` carrying
// the full serialized payload (base64 of the ClipboardPayload JSON). Empirically
// verified (probe, 2026-06-12): Chromium's async-write sanitizer and the paste
// event's `getData("text/html")` both preserve custom data-* attributes,
// including ~1 MB attribute values, and `getData("text/plain")` returns "" when
// no text flavor was written. Consequences:
//
//   - External apps no longer see the raw "weave:clipboard:v1" string — a
//     plain-text paste target receives nothing, a rich-text target receives an
//     invisible empty span (Figma parity).
//   - The OS clipboard becomes a third transport: a tab whose in-memory store
//     missed the BroadcastChannel/localStorage broadcast (e.g. opened AFTER the
//     copy) can reconstruct the payload from the paste event itself.
//
// Payloads whose base64 exceeds MAX_OS_PAYLOAD_CHARS (data:-URL image
// fallbacks) are stamped marker-only — recency still resolves; only the
// fresh-tab reconstruction is unavailable for that payload. When the rich
// write path is unavailable (no ClipboardItem / `clipboard.write` rejects),
// the legacy plain-text marker write is attempted before declaring failure.
//
// Failure containment: writes can fail (API missing, permission denied,
// document blurred, non-secure context). Health is tracked per tab — until a
// write has SUCCEEDED, `osMarkerRoutingActive()` stays false and the Cmd+V
// binding keeps the legacy WI-185 store-probe routing (internal-first), so a
// broken clipboard API degrades to the previous behavior, never to a dead
// paste. A later failed write also flips back to legacy routing: the OS
// clipboard no longer reflects the newest internal copy, so the marker can't
// be trusted as a recency oracle anymore.
//
// Cross-tab health (WI-187): the OS clipboard is machine-global, so once ANY
// tab's marker write succeeds, marker routing is trustworthy in EVERY tab of
// this origin. `mountMarkerHealthTransport()` broadcasts local ok/failed
// transitions on a dedicated BroadcastChannel; receiving tabs adopt the value
// (latest transition wins — the same semantics as local writes). Environments
// without BroadcastChannel silently keep per-tab health (the pre-WI-187
// behavior).

import { isValidIncomingClipboardPayload, type KnownClipboardPayload } from "./clipboard-types.js";

export const WEAVE_OS_CLIPBOARD_MARKER = "weave:clipboard:v1";

const MARKER_ATTR = "data-weave-clipboard";
const PAYLOAD_ATTR = "data-weave-payload";
const MARKER_ATTR_FRAGMENT = `${MARKER_ATTR}="v1"`;

/** Upper bound for the base64-encoded payload embedded in the HTML stamp.
 *  Above it (realistically: data:-URL image fallbacks) the stamp degrades to
 *  marker-only — recency still resolves, fresh-tab reconstruction doesn't.
 *  2M chars ≈ 1.5 MB JSON; the empirical probe round-tripped 1 MB losslessly
 *  and typical payloads (cloud-URL images, shapes, text) are a few KB. */
export const MAX_OS_PAYLOAD_CHARS = 2_000_000;

type MarkerHealth = "unknown" | "ok" | "failed";

let health: MarkerHealth = "unknown";

// ---------------------------------------------------------------------------
// WI-187 — cross-tab health transport
// ---------------------------------------------------------------------------

const HEALTH_CHANNEL_NAME = "weave.clipboard.marker-health.v1";

interface HealthMessage {
  readonly schemaVersion: 1;
  readonly health: "ok" | "failed";
}

interface HealthChannelLike {
  postMessage(message: unknown): void;
  close(): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
}

/** Mounted health channels — local transitions fan out to every peer tab.
 *  A Set (not a single ref) keeps StrictMode's overlapping mount/unmount
 *  pairs independent; same-tab echo between two mounted channels is
 *  idempotent (adoption never re-posts). */
const healthChannels = new Set<HealthChannelLike>();

function isValidHealthMessage(data: unknown): data is HealthMessage {
  if (data === null || typeof data !== "object") return false;
  const m = data as Partial<HealthMessage>;
  return m.schemaVersion === 1 && (m.health === "ok" || m.health === "failed");
}

/** Local write resolved — record and broadcast the transition. */
function setLocalHealth(next: "ok" | "failed"): void {
  health = next;
  const msg: HealthMessage = { schemaVersion: 1, health: next };
  for (const ch of healthChannels) {
    try {
      ch.postMessage(msg);
    } catch {
      // Channel closed mid-iteration — the dispose path removes it.
    }
  }
}

/**
 * WI-187 — mount the cross-tab marker-health transport. A peer tab whose
 * marker write resolved broadcasts ok/failed; this tab adopts it, because
 * the OS clipboard the marker describes is shared across all tabs.
 * Environment-defensive: no BroadcastChannel → no-op (per-tab health only).
 */
export function mountMarkerHealthTransport(): () => void {
  const Ctor = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
  if (Ctor === undefined) return () => {};
  let channel: HealthChannelLike;
  try {
    channel = new Ctor(HEALTH_CHANNEL_NAME) as unknown as HealthChannelLike;
  } catch {
    return () => {};
  }
  const handleMessage = (event: { data: unknown }): void => {
    if (!isValidHealthMessage(event.data)) return;
    // Adopt without re-broadcasting (no echo loop): the sender's transition
    // already reached every tab.
    health = event.data.health;
  };
  channel.addEventListener("message", handleMessage);
  healthChannels.add(channel);
  return () => {
    healthChannels.delete(channel);
    channel.removeEventListener("message", handleMessage);
    channel.close();
  };
}

// ---------------------------------------------------------------------------
// WI-188 — HTML stamp build / extract
// ---------------------------------------------------------------------------

/** base64-encode the payload JSON (UTF-8 safe, chunked to dodge call-stack
 *  limits on large arrays). Returns undefined when over the size cap or
 *  serialization fails — callers degrade to a marker-only stamp. */
function encodePayload(payload: KnownClipboardPayload): string | undefined {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const b64 = btoa(bin);
    return b64.length > MAX_OS_PAYLOAD_CHARS ? undefined : b64;
  } catch {
    return undefined;
  }
}

function decodePayload(encoded: string): unknown {
  const bin = atob(encoded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** The text/html stamp: an empty span — invisible in rich-text paste targets,
 *  nothing at all in plain-text targets (no text flavor is written). base64
 *  uses only `A-Za-z0-9+/=`, all attribute-value-safe — no escaping needed. */
export function buildMarkerHtml(payload?: KnownClipboardPayload): string {
  const encoded = payload === undefined ? undefined : encodePayload(payload);
  const payloadAttr = encoded === undefined ? "" : ` ${PAYLOAD_ATTR}="${encoded}"`;
  return `<meta charset="utf-8"><span ${MARKER_ATTR}="v1"${payloadAttr}></span>`;
}

/**
 * Extract the serialized payload embedded in a native paste event's text/html
 * flavor, or undefined (marker-only stamp, foreign HTML, decode failure,
 * unknown schema — RISK-008 R4 applies to this transport too). DOMParser
 * yields an inert document: scripts never execute, resources never load.
 */
export function extractOsClipboardPayload(e: ClipboardEvent): KnownClipboardPayload | undefined {
  const html = e.clipboardData?.getData("text/html");
  if (html === undefined || !html.includes(MARKER_ATTR_FRAGMENT)) return undefined;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const encoded = doc.querySelector(`[${PAYLOAD_ATTR}]`)?.getAttribute(PAYLOAD_ATTR);
    if (encoded === null || encoded === undefined || encoded === "") return undefined;
    const parsed = decodePayload(encoded);
    return isValidIncomingClipboardPayload(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Write / detect
// ---------------------------------------------------------------------------

/** Fire-and-forget: stamp the OS clipboard after a successful internal
 *  copy / cut. Preferred flavor = text/html with the embedded payload
 *  (WI-188); fallback = the legacy plain-text marker. The async resolution
 *  updates the routing health — a Cmd+V racing the in-flight write sees
 *  `unknown` and takes the legacy internal-first path, which is the correct
 *  outcome for a copy-then-immediately-paste anyway. */
export function writeOsClipboardMarker(payload?: KnownClipboardPayload): void {
  const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (clipboard === undefined) {
    setLocalHealth("failed");
    return;
  }

  const writeLegacyText = (): void => {
    if (typeof clipboard.writeText !== "function") {
      setLocalHealth("failed");
      return;
    }
    clipboard.writeText(WEAVE_OS_CLIPBOARD_MARKER).then(
      () => setLocalHealth("ok"),
      () => setLocalHealth("failed"),
    );
  };

  const ClipboardItemCtor = typeof ClipboardItem !== "undefined" ? ClipboardItem : undefined;
  if (typeof clipboard.write === "function" && ClipboardItemCtor !== undefined) {
    try {
      const html = buildMarkerHtml(payload);
      clipboard
        .write([new ClipboardItemCtor({ "text/html": new Blob([html], { type: "text/html" }) })])
        .then(
          () => setLocalHealth("ok"),
          // Rich write rejected (e.g. flavor unsupported) — the plain-text
          // marker still resolves recency, so try it before giving up.
          () => writeLegacyText(),
        );
      return;
    } catch {
      // ClipboardItem construction threw — fall through to the text path.
    }
  }
  writeLegacyText();
}

/** True once a marker write has succeeded in this tab — or, via the WI-187
 *  health transport, in any peer tab — the signal that the native-paste
 *  router can be trusted over the legacy keydown probe. */
export function osMarkerRoutingActive(): boolean {
  return health === "ok";
}

/** Synchronous marker check inside a native `paste` event handler. Detects
 *  both the WI-188 HTML stamp (substring match — Chromium re-wraps written
 *  HTML in `<html><body>…`) and the legacy plain-text marker (older tabs
 *  during deploy skew, text-fallback writes). */
export function clipboardEventHasOsMarker(e: ClipboardEvent): boolean {
  const d = e.clipboardData;
  if (d === null || d === undefined) return false;
  if (d.getData("text/plain") === WEAVE_OS_CLIPBOARD_MARKER) return true;
  return d.getData("text/html").includes(MARKER_ATTR_FRAGMENT);
}

/** Test-only reset — production code never rewinds health. */
export function __resetOsClipboardMarkerForTests(): void {
  health = "unknown";
  healthChannels.clear();
}
