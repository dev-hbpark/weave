// WI-051 Step 3 / DR-064 — engine-side text measurement wiring (weave host).
//
// The agocraft layout engine measures a text leaf's intrinsic size through an
// INJECTED `MeasureText` capability (it stays pure / DOM-free). weave provides the
// browser implementation (`@agocraft/text-measure-browser` = Pretext + Canvas2D) and
// hands it to the engine's Hug-reflow calls (commands.ts) — weave itself runs NO fit
// logic; it only wires the capability (a "pixel oracle"), per the hands-off goal.
//
// OFF BY DEFAULT. Changing engine layout sizing is gated on LIVE VERIFICATION (the
// hard workspace rule — measurement/observer changes have repeatedly regressed). So
// the measurer is injected only when `localStorage["weave.engineTextMeasure"] = "on"`.
// Default off ⇒ the engine keeps its current geometry behavior (zero behavior change,
// zero regression) until an operator live-verifies, then flips it on by default.

import type { MeasureText } from "@agocraft/layout";
import { createBrowserTextMeasurer } from "@agocraft/text-measure-browser";

/** True when engine-side text measurement is enabled (opt-in until live-verified). */
export function engineTextMeasureEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem("weave.engineTextMeasure") === "on";
  } catch {
    return false;
  }
}

let cached: MeasureText | undefined;

/** The browser text measurer (Pretext + Canvas2D), built once and reused, or
 *  `undefined` when disabled / unavailable (non-browser, no canvas). */
export function getEngineTextMeasurer(): MeasureText | undefined {
  if (!engineTextMeasureEnabled()) return undefined;
  if (cached === undefined) {
    try {
      cached = createBrowserTextMeasurer();
    } catch {
      return undefined; // no canvas (e.g. SSR / blocked) → engine keeps geometry path
    }
  }
  return cached;
}

/** The `{ measureText }` slice to spread into a Hug-reflow input — `{}` when disabled
 *  so the optional field stays absent (exactOptionalPropertyTypes-safe). */
export function measureTextInput(): { readonly measureText?: MeasureText } {
  const m = getEngineTextMeasurer();
  return m !== undefined ? { measureText: m } : {};
}
