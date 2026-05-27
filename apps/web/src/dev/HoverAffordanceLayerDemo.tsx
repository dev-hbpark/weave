// WI-040 Phase 2 — HoverAffordanceLayer visual demo.
//
// DEV-only route at `/_dev/hover-affordance-demo`. Visual evidence for
// DR-design-016 — proves the 3 tiers (hovered / siblings / parent) read
// as a single relationship at a glance because they share `--accent`
// hue. Not wired into the production document flow; the primitive
// receives hardcoded rects.
//
// Theme switcher (mono / aurora / vivid) is mounted so the demo proves
// the layer's tokens cascade through `[data-theme]` — flipping the
// switcher re-tints all three tiers in lock-step.
//
// Selection-exclusion rule (DR-design-016 §"Selection chrome 와 겹침
// 방지"): when an item is already selected, its hover outline is
// suppressed because SelectionLayer is already painting selection
// chrome over it. The "selected" toggles below simulate that — host
// (Phase 3) will compute the same filter from real selection state.

import { HoverAffordanceLayer, type HoverAffordanceRect, useTheme } from "@weave/design-system";
import { useState } from "react";

const PARENT: HoverAffordanceRect = { x: 40, y: 40, width: 720, height: 380, id: "parent" };
const SIBLINGS: ReadonlyArray<HoverAffordanceRect> = [
  { x: 64, y: 64, width: 240, height: 140, id: "sibling-a" },
  { x: 64, y: 240, width: 480, height: 140, id: "sibling-b" },
];
const HOVERED: HoverAffordanceRect = { x: 320, y: 64, width: 380, height: 140, id: "hovered" };

export function HoverAffordanceLayerDemo() {
  // Mount useTheme so visiting /_dev/... directly applies the stored
  // [data-theme] to <html>. Otherwise the demo would always show the
  // base @theme block (aurora-equivalent magenta).
  const { theme, setTheme } = useTheme();
  const [showHovered, setShowHovered] = useState(true);
  const [showSiblings, setShowSiblings] = useState(true);
  const [showParent, setShowParent] = useState(true);
  const [selectedHovered, setSelectedHovered] = useState(false);
  const [selectedSiblingA, setSelectedSiblingA] = useState(false);
  const [selectedSiblingB, setSelectedSiblingB] = useState(false);
  const [selectedParent, setSelectedParent] = useState(false);

  const renderedSiblings = SIBLINGS.filter((r) => {
    if (r.id === "sibling-a" && selectedSiblingA) return false;
    if (r.id === "sibling-b" && selectedSiblingB) return false;
    return true;
  });
  const renderedHovered = showHovered && !selectedHovered ? HOVERED : null;
  const renderedParent = showParent && !selectedParent ? PARENT : null;
  const renderedSiblingsList = showSiblings ? renderedSiblings : [];

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
        Three tiers (hovered / siblings / parent) share `--accent` hue. Flip the theme to confirm
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
            checked={showSiblings}
            onChange={(e) => setShowSiblings(e.target.checked)}
          />
          siblings ({SIBLINGS.length})
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
            checked={selectedSiblingA}
            onChange={(e) => setSelectedSiblingA(e.target.checked)}
          />
          sibling A
        </label>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={selectedSiblingB}
            onChange={(e) => setSelectedSiblingB(e.target.checked)}
          />
          sibling B
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
        {SIBLINGS.map((r) => (
          <div
            key={`mock-sibling-${r.id}`}
            aria-hidden
            style={{
              position: "absolute",
              left: r.x,
              top: r.y,
              width: r.width,
              height: r.height,
              background: "rgba(255,255,255,0.03)",
            }}
          />
        ))}
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
        <HoverAffordanceLayer
          visible={true}
          hovered={renderedHovered}
          siblings={renderedSiblingsList}
          parent={renderedParent}
        />
      </div>
    </div>
  );
}
