// WI-090 (DR-052) — runtime verification for the "link unit". A `button-trigger`
// behavior on an item renders a full-item click surface in Present mode (via the
// interaction registry + `ItemInteractionLayer`) whose click dispatches the
// behavior's `HotspotAction`:
//   • external    → window.open(url, "_blank", …)
//   • jump-camera → ctx.goToCameraId("present-<frameId>")
//
// The end-to-end (browser) path is covered by `e2e/present-link-unit.spec.ts`,
// but that spec is currently blocked by the offline edit-persistence gate the
// other present-interaction specs hit too (a fresh design's post-wizard edits
// never reach the present reload). This component test exercises the same
// registry → overlay → dispatch wiring directly, with no persistence in the
// loop, so the runtime is verified deterministically.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ItemInteractionLayer } from "../render/ItemInteractionLayer.js";
import type { HotspotAction, InteractionBehavior } from "../types.js";
import { interactionRegistry } from "./index.js";
import { PresentRuntimeProvider } from "./present-runtime-context.js";
import type { PresentContext } from "./types.js";

// React 18's `act` checks this flag to enable its testing semantics.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Minimal item carrying a single button-trigger unit (the shape `getBehaviors`
// reads — `units[].attrs.behavior`).
function itemWithLink(action: HotspotAction): {
  id: string;
  kind: string;
  units: ReadonlyArray<{ kind: string; attrs: { behavior: InteractionBehavior } }>;
} {
  return {
    id: "item-1",
    kind: "shape",
    units: [
      {
        kind: "button-trigger",
        attrs: { behavior: { kind: "button-trigger", id: "lnk-1", action } },
      },
    ],
  };
}

function makeCtx(overrides: Partial<PresentContext> = {}): PresentContext {
  return {
    doc: {} as PresentContext["doc"],
    step: 0,
    totalSteps: 3,
    cameraTargets: [],
    revealed: new Set<string>(),
    goToStep: vi.fn(),
    goToCameraId: vi.fn(),
    reveal: vi.fn(),
    close: vi.fn(),
    ...overrides,
  };
}

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
  vi.restoreAllMocks();
});

function renderLayer(ctx: PresentContext, item: ReturnType<typeof itemWithLink>): void {
  act(() => {
    root.render(
      <PresentRuntimeProvider value={ctx}>
        {/* biome-ignore lint/suspicious/noExplicitAny: structural AgoItem stub for the test */}
        <ItemInteractionLayer item={item as any} />
      </PresentRuntimeProvider>,
    );
  });
}

function clickLink(): void {
  const btn = container.querySelector<HTMLButtonElement>('[data-testid="present-link"]');
  if (btn === null) throw new Error("link overlay not rendered");
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

test("button-trigger is registered with a renderable overlay", () => {
  const adapter = interactionRegistry.get("button-trigger");
  expect(adapter).toBeDefined();
  expect(adapter?.renderOverlay).toBeTypeOf("function");
});

test("external link opens the URL in a new tab", () => {
  const openSpy = vi.fn().mockReturnValue(null);
  vi.stubGlobal("open", openSpy);
  renderLayer(makeCtx(), itemWithLink({ type: "external", href: "https://example.com/x" }));

  const btn = container.querySelector<HTMLButtonElement>('[data-testid="present-link"]');
  expect(btn).not.toBeNull();
  expect(btn?.getAttribute("data-button-action")).toBe("external");

  clickLink();
  expect(openSpy).toHaveBeenCalledWith("https://example.com/x", "_blank", "noopener,noreferrer");
});

test("jump-camera link navigates to the target slide camera", () => {
  const ctx = makeCtx();
  renderLayer(ctx, itemWithLink({ type: "jump-camera", targetId: "present-frame-2" }));

  clickLink();
  expect(ctx.goToCameraId).toHaveBeenCalledWith("present-frame-2");
  expect(ctx.goToStep).not.toHaveBeenCalled();
});

test("layer renders nothing for an item with no behaviors", () => {
  renderLayer(makeCtx(), { id: "bare", kind: "shape", units: [] });
  expect(container.querySelector('[data-testid="present-link"]')).toBeNull();
});

test("the link overlay sits at z-index 1 (above content, below inline <a> at z-2)", () => {
  // DR-052 §2 precedence contract: the overlay must cover the item's own
  // content (z-auto) but stay under a text item's inline hyperlink (z-index 2,
  // set in TextBlock) so inline links win their glyphs.
  renderLayer(makeCtx(), itemWithLink({ type: "external", href: "https://x" }));
  const btn = container.querySelector<HTMLButtonElement>('[data-testid="present-link"]');
  expect(btn?.style.zIndex).toBe("1");
});
