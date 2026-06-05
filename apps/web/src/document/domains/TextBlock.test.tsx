// DR-057 — `textRuns` is the single source of truth for inline formatting.
//
// Client-rendered (createRoot + act, jsdom) so the no-op selection vm's
// `useSyncExternalStore` works without a server snapshot. We assert against the
// real DOM, not serialized markup. Present mode (no `onUpdate`) keeps the
// Lexical editor unmounted; `useResolveColor` falls back to the raw color with
// no provider. `ResizeObserver` is stubbed (jsdom has none).
//
// Contract pinned:
//   1. With `textRuns`, the inner content container NEUTRALIZES its inline
//      toggleables so per-run <span>s are authoritative — a run with no bold
//      attr renders normal even when the item-level attr is bold (the
//      un-bold-a-range case the old inherited weight made impossible).
//   2. With no runs, the container keeps the item-level attrs (legacy path).

import type { TextRun } from "@agocraft/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { AgoItem, TextAttrs } from "../types.js";
import { FULL_FRAME } from "../types.js";
import { TextBlock } from "./TextBlock.js";

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

function textItem(attrs: Partial<TextAttrs>): AgoItem<"text"> {
  return {
    id: "text-1",
    kind: "text",
    units: [],
    attrs: {
      frame: FULL_FRAME,
      text: "hello world",
      fontFamily: "Inter, sans-serif",
      fontSize: 24,
      fontWeight: "normal",
      fontStyle: "normal",
      color: "#111111",
      textAlign: "left",
      lineHeight: 1.4,
      letterSpacing: 0,
      ...attrs,
    } as unknown as TextAttrs,
  } as unknown as AgoItem<"text">;
}

function render(item: AgoItem<"text">): void {
  act(() => {
    root.render(<TextBlock item={item} />);
  });
}

function contentDiv(): HTMLElement {
  const el = container.querySelector<HTMLElement>("[data-text-content]");
  if (el === null) throw new Error("content div not found");
  return el;
}

test("run-driven box neutralizes the container; a non-bold run renders normal even when item-level is bold", () => {
  const runs: ReadonlyArray<TextRun> = [
    { insert: "hello", attributes: { fontWeight: "bold" } },
    { insert: " world" },
  ];
  render(textItem({ fontWeight: "bold", textRuns: runs }));

  // Container neutralized to normal weight…
  expect(contentDiv().style.fontWeight).toBe("normal");

  const spans = contentDiv().querySelectorAll("span");
  expect(spans.length).toBe(2);
  // First run carries its own bold; the plain run emits NO weight → inherits
  // the neutralized container (normal). This is the un-bold-a-range fix.
  expect(spans[0]!.style.fontWeight).toBe("bold");
  expect(spans[1]!.style.fontWeight).toBe("");
});

test("legacy box with no runs keeps the item-level bold on the container", () => {
  render(textItem({ fontWeight: "bold" }));
  expect(contentDiv().style.fontWeight).toBe("bold");
  // No runs → plain text node, no per-run spans.
  expect(contentDiv().querySelectorAll("span").length).toBe(0);
});

test("run-driven underline override: a plain run renders no decoration under a struck-through base", () => {
  const runs: ReadonlyArray<TextRun> = [
    { insert: "under", attributes: { textDecoration: "UNDERLINE" } },
    { insert: "plain" },
  ];
  render(textItem({ textDecoration: "STRIKETHROUGH", textRuns: runs }));

  // Container decoration neutralized (would otherwise force line-through on the
  // plain run via the item-level STRIKETHROUGH base).
  expect(contentDiv().style.textDecoration).toBe("none");
  const spans = contentDiv().querySelectorAll("span");
  expect(spans[0]!.style.textDecoration).toBe("underline");
  expect(spans[1]!.style.textDecoration).toBe("");
});

// ── DR-059 — layered text outline ──────────────────────────────────────────

test("textOutline renders a thick stroked back layer behind the fill", () => {
  render(textItem({ textOutline: { color: "#ff0000", width: 3 } }));

  const back = contentDiv().querySelector<HTMLElement>("[data-text-outline]");
  expect(back).not.toBeNull();
  // Decorative + non-interactive; the real text is the front fill.
  expect(back!.getAttribute("aria-hidden")).toBe("true");
  expect(back!.style.pointerEvents).toBe("none");
  expect(back!.style.position).toBe("absolute");
  // Forced outline color on the back container (glyphs inherit it).
  expect(back!.style.color).toBe("rgb(255, 0, 0)");
  // Stroke = 2× the visible halo; serialized into the inline style.
  expect(back!.style.cssText).toContain("stroke");
  // Both layers carry the same text (front fill + back outline).
  expect(back!.textContent).toBe("hello world");
  expect(contentDiv().textContent).toContain("hello world");
});

test("no textOutline → no back layer (DOM unchanged)", () => {
  render(textItem({}));
  expect(contentDiv().querySelector("[data-text-outline]")).toBeNull();
});

test("width 0 → no outline layer", () => {
  render(textItem({ textOutline: { color: "#000000", width: 0 } }));
  expect(contentDiv().querySelector("[data-text-outline]")).toBeNull();
});

test("outline back layer does NOT inherit a run's fill color (glyphs stay outline-colored)", () => {
  const runs: ReadonlyArray<TextRun> = [{ insert: "red", attributes: { color: "#00ff00" } }];
  render(textItem({ textRuns: runs, textOutline: { color: "#123456", width: 2 } }));

  const back = contentDiv().querySelector<HTMLElement>("[data-text-outline]");
  expect(back).not.toBeNull();
  // The back run span drops per-run color so the forced outline color wins.
  const backSpan = back!.querySelector("span");
  expect(backSpan!.style.color).toBe("");
  // The FRONT fill keeps the run's own color.
  const frontSpans = Array.from(contentDiv().querySelectorAll("span")).filter(
    (s) => !back!.contains(s),
  );
  expect(frontSpans.some((s) => s.style.color === "rgb(0, 255, 0)")).toBe(true);
});

// ── DR-060 — per-range outline ─────────────────────────────────────────────

// A run carries its OWN outline (weave-local run attrs); a sibling run does not.
const PER_RUN: ReadonlyArray<TextRun> = [
  { insert: "out", attributes: { outlineColor: "#ff0000", outlineWidth: 3 } as never },
  { insert: "plain" },
];

test("a run with its own outline renders a back layer even with no whole-item outline", () => {
  render(textItem({ textRuns: PER_RUN }));
  const back = contentDiv().querySelector<HTMLElement>("[data-text-outline]");
  expect(back).not.toBeNull();
  const spans = back!.querySelectorAll("span");
  // The outlined run strokes itself (2× the 3px halo); cssText carries the stroke.
  expect(spans[0]!.style.cssText).toContain("stroke");
  expect(spans[0]!.style.color).toBe("rgb(255, 0, 0)");
  // The non-outlined run paints nothing in the back layer (transparent).
  expect(spans[1]!.style.color).toBe("transparent");
});

test("with NO per-run and NO whole-item outline, there is no back layer", () => {
  render(textItem({ textRuns: [{ insert: "plain" }] }));
  expect(contentDiv().querySelector("[data-text-outline]")).toBeNull();
});

test("a non-outlined run inherits the whole-item outline (not transparent)", () => {
  const runs: ReadonlyArray<TextRun> = [
    { insert: "a", attributes: { outlineColor: "#00ff00", outlineWidth: 2 } as never },
    { insert: "b" },
  ];
  render(textItem({ textRuns: runs, textOutline: { color: "#0000ff", width: 1 } }));
  const back = contentDiv().querySelector<HTMLElement>("[data-text-outline]");
  expect(back).not.toBeNull();
  // Whole-item outline applied on the container so non-outlined runs inherit it.
  expect(back!.style.color).toBe("rgb(0, 0, 255)");
  const spans = back!.querySelectorAll("span");
  // Per-run override on "a".
  expect(spans[0]!.style.color).toBe("rgb(0, 255, 0)");
  // "b" has no own style → inherits the container's whole-item outline.
  expect(spans[1]!.style.color).toBe("");
});
