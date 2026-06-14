// Regression — present mode "edit order ≠ present order" (z-order fallback).
//
// The WI-161 delta load rebuilds `design.document` by replaying the patch tail
// onto an OLD snapshot, but spreads the snapshot's WRAPPER. A reorder /
// background change in the tail lands in `document.attrs` yet leaves the
// wrapper (`design.presentationOrder` / `design.background`) stale. Present
// mode reads the wrapper to build its step list, so the lag surfaced as the
// present deck stepping in document (z-)order instead of the user's reorder.
// `mirrorWrapperFromDocument` re-syncs the wrapper from the replayed document —
// the same doc.attrs → wrapper mirror `applyChange` does for live edits.

import type { Document as AgocraftDocument } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { createBlankDesign } from "./storage.js";
import { mirrorWrapperFromDocument } from "./use-design.js";

function withDocAttrs(
  doc: AgocraftDocument,
  attrs: Record<string, unknown>,
): AgocraftDocument {
  return { ...doc, attrs: { ...(doc.attrs ?? {}), ...attrs } } as AgocraftDocument;
}

describe("mirrorWrapperFromDocument (WI-161 present order regression)", () => {
  it("syncs presentationOrder from the replayed document onto the stale wrapper", () => {
    const base = createBlankDesign({ id: "d1", title: "T", width: 1920, height: 1080 });
    // Snapshot wrapper recorded an OLD order; the replayed document carries the
    // user's reorder in its attrs (as a setPresentationOrder patch would).
    const stale = { ...base, presentationOrder: ["a", "b"] as ReadonlyArray<string> };
    const replayed = {
      ...stale,
      document: withDocAttrs(stale.document, { presentationOrder: ["b", "a"] }),
    };

    const mirrored = mirrorWrapperFromDocument(replayed);

    expect(mirrored.presentationOrder).toEqual(["b", "a"]);
  });

  it("syncs background from the replayed document onto the wrapper", () => {
    const base = createBlankDesign({ id: "d2", title: "T", width: 1920, height: 1080 });
    const replayed = {
      ...base,
      document: withDocAttrs(base.document, { background: "#123456" }),
    };

    expect(mirrorWrapperFromDocument(replayed).background).toBe("#123456");
  });

  it("keeps the wrapper value when the document carries no design-level attrs", () => {
    const base = createBlankDesign({ id: "d3", title: "T", width: 1920, height: 1080 });
    const stale = {
      ...base,
      presentationOrder: ["x", "y"] as ReadonlyArray<string>,
      background: "#abcdef",
    };

    const mirrored = mirrorWrapperFromDocument(stale);

    expect(mirrored.presentationOrder).toEqual(["x", "y"]);
    expect(mirrored.background).toBe("#abcdef");
  });
});
