// WI-186 — OS-clipboard weave marker (DR-122).
//
// Problem (WI-185 ⑰ residual): once a weave item is copied, the in-memory
// clipboard store stays non-empty for the rest of the session, so the
// keydown-time probe routed EVERY later Cmd+V to the internal paste — an
// OS-clipboard image copied AFTER the weave copy was unreachable.
//
// Fix: copying / cutting weave items also stamps a small marker string into
// the OS clipboard (`navigator.clipboard.writeText`). Because every clipboard
// write REPLACES the OS clipboard wholesale, marker presence at paste time is
// a recency oracle:
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
// Failure containment: `writeText` can fail (API missing, permission denied,
// document blurred, non-secure context). Health is tracked per tab — until a
// write has SUCCEEDED, `osMarkerRoutingActive()` stays false and the Cmd+V
// binding keeps the legacy WI-185 store-probe routing (internal-first), so a
// broken clipboard API degrades to the previous behavior, never to a dead
// paste. A later failed write also flips back to legacy routing: the OS
// clipboard no longer reflects the newest internal copy, so the marker can't
// be trusted as a recency oracle anymore.
//
// Known limitation (recorded in DR-122): health is per-tab. A tab that only
// RECEIVED the payload via the cross-tab transports keeps legacy routing —
// correct result for internal pastes, but the recency fix only applies in
// tabs that have themselves copied.

export const WEAVE_OS_CLIPBOARD_MARKER = "weave:clipboard:v1";

type MarkerHealth = "unknown" | "ok" | "failed";

let health: MarkerHealth = "unknown";

/** Fire-and-forget: stamp the OS clipboard with the weave marker after a
 *  successful internal copy / cut. The async resolution updates the routing
 *  health — a Cmd+V racing the in-flight write sees `unknown` and takes the
 *  legacy internal-first path, which is the correct outcome for a
 *  copy-then-immediately-paste anyway. */
export function writeOsClipboardMarker(): void {
  const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (clipboard === undefined || typeof clipboard.writeText !== "function") {
    health = "failed";
    return;
  }
  clipboard.writeText(WEAVE_OS_CLIPBOARD_MARKER).then(
    () => {
      health = "ok";
    },
    () => {
      health = "failed";
    },
  );
}

/** True once a marker write has succeeded in this tab — the signal that the
 *  native-paste router can be trusted over the legacy keydown probe. */
export function osMarkerRoutingActive(): boolean {
  return health === "ok";
}

/** Synchronous marker check inside a native `paste` event handler. */
export function clipboardEventHasOsMarker(e: ClipboardEvent): boolean {
  return e.clipboardData?.getData("text/plain") === WEAVE_OS_CLIPBOARD_MARKER;
}

/** Test-only reset — production code never rewinds health. */
export function __resetOsClipboardMarkerForTests(): void {
  health = "unknown";
}
