// WI-040 Phase 2 — HoverAffordanceLayer visual demo.
//
// DEV-only route at `/_dev/hover-affordance-demo`. Visual evidence for
// DR-design-016 — proves the 3 tiers (hovered / siblings / parent) read
// as a single relationship at a glance because they share `--accent`
// hue. Not wired into the production document flow; the primitive
// receives hardcoded rects.

import { HoverAffordanceLayer, type HoverAffordanceRect } from "@weave/design-system";
import { useState } from "react";

const PARENT: HoverAffordanceRect = { x: 40, y: 40, width: 720, height: 380 };
const SIBLINGS: ReadonlyArray<HoverAffordanceRect> = [
  { x: 64, y: 64, width: 240, height: 140 },
  { x: 64, y: 240, width: 480, height: 140 },
];
const HOVERED: HoverAffordanceRect = { x: 320, y: 64, width: 380, height: 140 };

export function HoverAffordanceLayerDemo() {
  const [showHovered, setShowHovered] = useState(true);
  const [showSiblings, setShowSiblings] = useState(true);
  const [showParent, setShowParent] = useState(true);
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
        Three tiers (hovered / siblings / parent) share `--accent` hue. Toggle each to confirm the
        relationship reads as one group.
      </p>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
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
      </div>
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
            key={`mock-sibling-${r.x}x${r.y}`}
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
          hovered={showHovered ? HOVERED : null}
          siblings={showSiblings ? SIBLINGS : []}
          parent={showParent ? PARENT : null}
        />
      </div>
    </div>
  );
}
