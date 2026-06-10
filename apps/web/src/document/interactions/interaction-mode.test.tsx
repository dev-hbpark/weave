// WI-166 P4 — FSM gate hooks read the INJECTED InputPolicy (DR-114 §2b
// fake-policy injection test): the admissible set per gate is the policy
// table's decision, not a hook-local hardcoding. The FSM machine itself
// (claim/release, tokensByMode) is untouched by P4 and exercised via e2e.

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { InputPolicy } from "../editor-mode/types.js";
import {
  InteractionModeProvider,
  PeekActiveProvider,
  useEditAffordancesAllowed,
  useFrameDragBindingsAllowed,
  useFrameSelectionAllowed,
  useSelectionChromeVisible,
  useTooltipsAllowed,
} from "./interaction-mode.js";

// React 18's `act` checks this flag to enable its testing semantics.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

interface GateReadout {
  tooltips: boolean;
  frameSelection: boolean;
  editAffordances: boolean;
  selectionChrome: boolean;
  frameDragBindings: boolean;
}

function GateProbe({ out }: { readonly out: GateReadout }) {
  out.tooltips = useTooltipsAllowed();
  out.frameSelection = useFrameSelectionAllowed();
  out.editAffordances = useEditAffordancesAllowed();
  out.selectionChrome = useSelectionChromeVisible();
  out.frameDragBindings = useFrameDragBindingsAllowed();
  return null;
}

function readGates(ui: (probe: ReactNode) => ReactNode): GateReadout {
  const out: GateReadout = {
    tooltips: false,
    frameSelection: false,
    editAffordances: false,
    selectionChrome: false,
    frameDragBindings: false,
  };
  act(() => {
    root.render(ui(<GateProbe out={out} />));
  });
  return out;
}

/** Hand-rolled policy — closes only the `tooltips` gate at idle, keeps the
 *  rest open. No registry, no flavor, no vm: the DI payoff. */
const TOOLTIPS_CLOSED: InputPolicy = {
  gates: {
    tooltips: new Set(),
    frameSelection: new Set(["idle"]),
    editAffordances: new Set(["idle"]),
    selectionChrome: new Set(["idle"]),
    frameDragBindings: new Set(["idle"]),
  },
};

test("gate hooks read the injected policy table — a closed gate denies even at idle", () => {
  // No vm prop → the FSM no-op fallback pins the mode to "idle". Pre-P4
  // every gate was hardwired open at idle; with the fake policy the
  // tooltips gate flips independently of the others.
  const out = readGates((probe) => (
    <InteractionModeProvider input={TOOLTIPS_CLOSED}>{probe}</InteractionModeProvider>
  ));
  expect(out.tooltips).toBe(false);
  expect(out.frameSelection).toBe(true);
  expect(out.editAffordances).toBe(true);
  expect(out.selectionChrome).toBe(true);
  expect(out.frameDragBindings).toBe(true);
});

test("without a provider every gate is open (mode is pinned idle there — legacy behavior)", () => {
  const out = readGates((probe) => probe);
  expect(out).toEqual({
    tooltips: true,
    frameSelection: true,
    editAffordances: true,
    selectionChrome: true,
    frameDragBindings: true,
  });
});

test("the peek axis stays in the hooks, AND-ed onto the policy gates (WI-040)", () => {
  // Peek is a weave product surface, not a flavor policy — an open gate
  // must still stand down for editAffordances / selectionChrome /
  // frameDragBindings while peek owns the canvas.
  const allOpen: InputPolicy = {
    gates: {
      tooltips: new Set(["idle"]),
      frameSelection: new Set(["idle"]),
      editAffordances: new Set(["idle"]),
      selectionChrome: new Set(["idle"]),
      frameDragBindings: new Set(["idle"]),
    },
  };
  const out = readGates((probe) => (
    <InteractionModeProvider input={allOpen}>
      <PeekActiveProvider active={true}>{probe}</PeekActiveProvider>
    </InteractionModeProvider>
  ));
  expect(out.editAffordances).toBe(false);
  expect(out.selectionChrome).toBe(false);
  expect(out.frameDragBindings).toBe(false);
  // The peek-independent gates stay policy-only.
  expect(out.tooltips).toBe(true);
  expect(out.frameSelection).toBe(true);
});
