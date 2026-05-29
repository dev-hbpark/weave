// WI-040 Phase 2 — HoverAffordanceLayer visual demo.
//
// DEV-only route at `/_dev/hover-affordance-demo`. Visual evidence for
// DR-design-016 — proves the 3 tiers (hovered / descendants / parent)
// read as a single relationship at a glance because they share
// `--accent` hue. Not wired into the production document flow; the
// primitive receives hardcoded rects.
//
// 2026-05-27 scope update: the middle tier is now the hovered item's
// own descendants (children of the hovered subtree), not its tree
// siblings. The demo layout reflects that — descendant rects sit
// INSIDE the hovered rect, the same way they will at runtime.
//
// Theme switcher (mono / aurora / vivid) is mounted so the demo proves
// the layer's tokens cascade through `[data-theme]` — flipping the
// switcher re-tints all three tiers in lock-step.
//
// Selection-exclusion rule (DR-design-016 §"Selection chrome 와 겹침
// 방지"): when an item is already selected, its hover outline is
// suppressed because SelectionLayer is already painting selection
// chrome over it. The "selected" toggles below simulate that — host
// (Phase 3) computes the same filter from real selection state.

import { HoverAffordanceLayer, type HoverAffordanceRect, useTheme } from "@weave/design-system";
import { useRef, useState } from "react";

const PARENT: HoverAffordanceRect = { x: 40, y: 40, width: 720, height: 380, id: "parent" };
const HOVERED: HoverAffordanceRect = { x: 200, y: 100, width: 400, height: 260, id: "hovered" };
// Descendant rects sit INSIDE the hovered rect to match real-runtime
// geometry (descendants of a frame are nested in the frame's box).
const DESCENDANTS: ReadonlyArray<HoverAffordanceRect> = [
  { x: 220, y: 120, width: 170, height: 100, id: "descendant-a" },
  { x: 410, y: 120, width: 170, height: 100, id: "descendant-b" },
  { x: 220, y: 240, width: 360, height: 100, id: "descendant-c" },
];

export function HoverAffordanceLayerDemo() {
  // Mount useTheme so visiting /_dev/... directly applies the stored
  // [data-theme] to <html>. Otherwise the demo would always show the
  // base @theme block (aurora-equivalent magenta).
  const { theme, setTheme } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const [showHovered, setShowHovered] = useState(true);
  const [showDescendants, setShowDescendants] = useState(true);
  const [showParent, setShowParent] = useState(true);
  const [selectedHovered, setSelectedHovered] = useState(false);
  const [selectedDescA, setSelectedDescA] = useState(false);
  const [selectedDescB, setSelectedDescB] = useState(false);
  const [selectedParent, setSelectedParent] = useState(false);

  const renderedDescendants = DESCENDANTS.filter((r) => {
    if (r.id === "descendant-a" && selectedDescA) return false;
    if (r.id === "descendant-b" && selectedDescB) return false;
    return true;
  });
  const renderedHovered = showHovered && !selectedHovered ? HOVERED : null;
  const renderedParent = showParent && !selectedParent ? PARENT : null;
  const renderedDescendantsList = showDescendants ? renderedDescendants : [];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-canvas, #0a0d1a)",
        color: "var(--text-default, white)",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ margin: "0 0 8px", fontSize: 18 }}>
        HoverAffordanceLayer — DR-design-016 visual evidence
      </h1>
      <p style={{ margin: "0 0 16px", opacity: 0.7, fontSize: 13 }}>
        Three tiers (hovered / descendants / parent) share `--accent` hue. Flip the theme to confirm
        the layer follows; flip "selected" to confirm the overlap-with-selection-chrome rule.
      </p>

      {/* Theme switcher — proves `--accent` cascades through [data-theme]. */}
      <fieldset
        style={{
          border: "1px solid var(--border-default, rgba(255,255,255,0.12))",
          borderRadius: 6,
          padding: "8px 12px",
          marginBottom: 12,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <legend style={{ padding: "0 6px", fontSize: 12, opacity: 0.7 }}>theme</legend>
        {(["aurora", "mono", "vivid"] as const).map((t) => (
          <label
            key={`theme-${t}`}
            style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}
          >
            <input
              type="radio"
              name="hover-affordance-theme"
              value={t}
              checked={theme === t}
              onChange={() => setTheme(t)}
            />
            {t}
          </label>
        ))}
      </fieldset>

      {/* Tier visibility toggles. */}
      <fieldset
        style={{
          border: "1px solid var(--border-default, rgba(255,255,255,0.12))",
          borderRadius: 6,
          padding: "8px 12px",
          marginBottom: 12,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <legend style={{ padding: "0 6px", fontSize: 12, opacity: 0.7 }}>render</legend>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={showHovered}
            onChange={(e) => setShowHovered(e.target.checked)}
          />
          hovered
        </label>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={showDescendants}
            onChange={(e) => setShowDescendants(e.target.checked)}
          />
          descendants ({DESCENDANTS.length})
        </label>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={showParent}
            onChange={(e) => setShowParent(e.target.checked)}
          />
          parent
        </label>
      </fieldset>

      {/* Selection-exclusion simulation. */}
      <fieldset
        style={{
          border: "1px solid var(--border-default, rgba(255,255,255,0.12))",
          borderRadius: 6,
          padding: "8px 12px",
          marginBottom: 16,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <legend style={{ padding: "0 6px", fontSize: 12, opacity: 0.7 }}>
          selected (hover overlay suppressed where on)
        </legend>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={selectedHovered}
            onChange={(e) => setSelectedHovered(e.target.checked)}
          />
          hovered
        </label>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={selectedDescA}
            onChange={(e) => setSelectedDescA(e.target.checked)}
          />
          descendant A
        </label>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={selectedDescB}
            onChange={(e) => setSelectedDescB(e.target.checked)}
          />
          descendant B
        </label>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={selectedParent}
            onChange={(e) => setSelectedParent(e.target.checked)}
          />
          parent
        </label>
      </fieldset>

      <div
        ref={hostRef}
        style={{
          position: "relative",
          width: 800,
          height: 460,
          background: "var(--surface-1, rgba(255,255,255,0.04))",
          border: "1px solid var(--surface-1-border, rgba(255,255,255,0.14))",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {/* Static mock "items" so the viewer sees what the overlay is
            painting on top of. The HoverAffordanceLayer doesn't depend
            on these — they're just visual context. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: PARENT.x,
            top: PARENT.y,
            width: PARENT.width,
            height: PARENT.height,
            background: "rgba(255,255,255,0.02)",
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: HOVERED.x,
            top: HOVERED.y,
            width: HOVERED.width,
            height: HOVERED.height,
            background: "rgba(255,255,255,0.05)",
          }}
        />
        {DESCENDANTS.map((r) => (
          <div
            key={`mock-descendant-${r.id}`}
            aria-hidden
            style={{
              position: "absolute",
              left: r.x,
              top: r.y,
              width: r.width,
              height: r.height,
              background: "rgba(255,255,255,0.06)",
            }}
          />
        ))}
        <HoverAffordanceLayer
          visible={true}
          hovered={renderedHovered}
          descendants={renderedDescendantsList}
          parent={renderedParent}
          hostRef={hostRef}
        />
      </div>
    </div>
  );
}
