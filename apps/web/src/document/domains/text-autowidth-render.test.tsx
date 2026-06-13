// WI-216 — TextBlock must render auto-WIDTH (max-content) when the engine reports
// the WIDTH axis as content-auto via ContentAutoAxesContext (managed:true). This
// isolates TextBlock's CONSUMPTION of the context from NestedFrame's PROVISION.

import { createAutoFlexSpec } from "@agocraft/core";
import { contentAutoAxesFor } from "@agocraft/layout";
import { act, createElement, useContext } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { AgoItem, TextAttrs } from "../types.js";
import { FULL_FRAME } from "../types.js";
import { ContentAutoAxesContext, ParentLayoutContext } from "./parent-frame-context.js";
import { TextBlock } from "./TextBlock.js";

const flexRowSpec = createAutoFlexSpec({ direction: "row", align: "start" });

/** Mimics NestedFrame's per-text wiring: read parent layout from context, derive
 *  axes via the real engine, provide them, render TextBlock. */
function ChildLikeNestedFrame(): JSX.Element {
  const parentLayout = useContext(ParentLayoutContext);
  const axes = contentAutoAxesFor(parentLayout, {
    kind: "auto-flex",
    grow: 0,
    shrink: 1,
    basis: "auto",
  });
  return createElement(
    ContentAutoAxesContext.Provider,
    { value: axes },
    createElement(TextBlock, { item: textItem(FLEX_AUTO_CHILD) }),
  );
}

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function textItem(layoutChild: unknown): AgoItem<"text"> {
  return {
    id: "text-1",
    kind: "text",
    units: [],
    attrs: {
      frame: FULL_FRAME,
      text: "hello",
      fontFamily: "Inter, sans-serif",
      fontSize: 24,
      fontWeight: "normal",
      fontStyle: "normal",
      color: "#111",
      textAlign: "left",
      lineHeight: 1.4,
      letterSpacing: 0,
      layoutChild,
    } as unknown as TextAttrs,
  } as unknown as AgoItem<"text">;
}

function contentWidth(): string {
  const el = container.querySelector<HTMLElement>("[data-text-content]");
  if (el === null) throw new Error("content div not found");
  return el.style.width;
}

const FLEX_AUTO_CHILD = { kind: "auto-flex", grow: 0, shrink: 1, basis: "auto" };

test("managed width:true → content renders at max-content (auto-width)", () => {
  act(() => {
    root.render(
      createElement(
        ContentAutoAxesContext.Provider,
        { value: { managed: true, width: true, height: true } },
        createElement(TextBlock, { item: textItem(FLEX_AUTO_CHILD) }),
      ),
    );
  });
  expect(contentWidth()).toBe("max-content");
});

test("managed width:false → content renders at 100% (wraps; auto-height only)", () => {
  act(() => {
    root.render(
      createElement(
        ContentAutoAxesContext.Provider,
        { value: { managed: true, width: false, height: true } },
        createElement(TextBlock, { item: textItem(FLEX_AUTO_CHILD) }),
      ),
    );
  });
  expect(contentWidth()).toBe("100%");
});

// The regression: WITHOUT the context (managed:false default), a flex auto-width
// child falls back to deriveTextAutoResize(basis:"auto") = HEIGHT → NOT max-content
// → renders as auto-height. This is exactly what a stale/missing parent layout
// produced. The fix (NestedFrame provides real axes) yields the first test.
test("no context (managed:false) → flex auto child falls back to 100% (the bug)", () => {
  act(() => {
    root.render(createElement(TextBlock, { item: textItem(FLEX_AUTO_CHILD) }));
  });
  expect(contentWidth()).toBe("100%");
});

// End-to-end of NestedFrame's exact wiring: parent provides its layout via
// ParentLayoutContext → child derives axes with the REAL engine contentAutoAxesFor
// → provides ContentAutoAxesContext → TextBlock. Proves the integration yields
// auto-width for a flex-row auto child (what NestedFrame does at runtime).
test("NestedFrame-style chain: ParentLayoutContext(flex row) → contentAutoAxesFor → auto-width", () => {
  act(() => {
    root.render(
      createElement(
        ParentLayoutContext.Provider,
        { value: flexRowSpec },
        createElement(ChildLikeNestedFrame, null),
      ),
    );
  });
  expect(contentWidth()).toBe("max-content");
});
