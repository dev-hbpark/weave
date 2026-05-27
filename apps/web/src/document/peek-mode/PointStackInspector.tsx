// WI-019 Phase 3 (revision 2) — PointStackInspector.
//
// Rev2 changes:
//   - Dropped the "1-hop neighbors" toggle. The 1-hop expansion capability
//     is preserved on the controller for future micro-stacking domains
//     (canvas-design shape, hotspot interior) but the UI toggle was clutter
//     for the top-level Frame use case where weave Frames rarely overlap.
//   - Restyled for legibility: larger swatch, larger label, more contrast
//     on z badge, statusbar-style action hint, accent-tinted lifted state
//     when a row is currently being dragged.
//   - Empty state cleaner — friendly hint + larger visual.

import type { PeekLiftSet, PeekModeController } from "@agocraft/interaction";
import { type DragEvent, useState, useSyncExternalStore } from "react";

export interface PointStackInspectorProps {
  readonly controller: PeekModeController;
  /** Resolves a human-readable label for an item id. Defaults to the id. */
  readonly labelFor?: (itemId: string) => string;
  /** Resolves a swatch color for an item id (CSS color). Defaults to a
   *  surface tint. */
  readonly swatchFor?: (itemId: string) => string;
}

function useSignalValue<T>(sig: { get: () => T; subscribe: (h: (v: T) => void) => () => void }): T {
  return useSyncExternalStore(
    (cb) => sig.subscribe(() => cb()),
    () => sig.get(),
    () => sig.get(),
  );
}

interface StackRowProps {
  readonly id: string;
  readonly z: number;
  readonly label: string;
  readonly swatch: string;
  readonly isDragging: boolean;
  readonly isDropTarget: "above" | "below" | null;
  readonly onRowDragStart: () => boolean;
  readonly onRowDragOver: (above: boolean) => void;
  readonly onRowDrop: (above: boolean) => void;
  readonly onRowDragEnd: () => void;
  readonly onRowHover: (entering: boolean) => void;
}

function StackRow(p: StackRowProps): JSX.Element {
  function handleDragStart(e: DragEvent<HTMLDivElement>): void {
    if (!p.onRowDragStart()) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", p.id);
    e.dataTransfer.effectAllowed = "move";
  }
  function handleDragOver(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    p.onRowDragOver(above);
  }
  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    p.onRowDrop(above);
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnd={p.onRowDragEnd}
      onMouseEnter={() => p.onRowHover(true)}
      onMouseLeave={() => p.onRowHover(false)}
      data-stack-row-id={p.id}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 14px",
        margin: "0",
        background: p.isDragging ? "rgba(232, 58, 147, 0.18)" : "transparent",
        borderTop: p.isDropTarget === "above" ? "2px solid var(--accent)" : "1px solid transparent",
        borderBottom:
          p.isDropTarget === "below" ? "2px solid var(--accent)" : "1px solid transparent",
        borderLeft: "2px solid transparent",
        borderRight: "2px solid transparent",
        cursor: p.isDragging ? "grabbing" : "grab",
        userSelect: "none",
        transition: "background 140ms ease",
        opacity: p.isDragging ? 0.85 : 1,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          flexShrink: 0,
          background: p.swatch,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.4) inset, 0 0 0 1px rgba(255,255,255,0.16)",
        }}
      />
      <span
        style={{
          flex: 1,
          fontSize: 14,
          fontWeight: 500,
          color: "var(--text-overlay, var(--text-strong))",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={p.label}
      >
        {p.label}
      </span>
      <span
        aria-hidden
        style={{
          fontFamily: "ui-monospace, 'SF Mono', monospace",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--accent-strong, var(--accent))",
          background: "rgba(232, 58, 147, 0.16)",
          border: "1px solid rgba(232, 58, 147, 0.32)",
          padding: "3px 8px",
          borderRadius: 5,
          minWidth: 36,
          textAlign: "center",
        }}
      >
        z {p.z}
      </span>
    </div>
  );
}

export function PointStackInspector(props: PointStackInspectorProps): JSX.Element {
  const { controller, labelFor, swatchFor } = props;
  const isActive = useSignalValue(controller.isActive);
  const liftSet = useSignalValue<PeekLiftSet | null>(controller.liftSet);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropMark, setDropMark] = useState<{ id: string; pos: "above" | "below" } | null>(null);

  const labelOf = labelFor ?? ((id) => id);
  const swatchOf = swatchFor ?? (() => "rgba(255,255,255,0.12)");

  function metaLine(): string {
    if (!isActive) return "Hold L or click the layer button to peek";
    if (!liftSet) return "Hover the canvas to inspect";
    const n = liftSet.coreIds.length;
    return `${n} item${n === 1 ? "" : "s"} at cursor`;
  }

  // Render top-down (highest z first)
  const orderedTopDown = liftSet ? [...liftSet.orderedIds].reverse() : [];

  return (
    <section
      role="region"
      aria-label="Point Stack Inspector"
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        bottom: 16,
        width: 300,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: "var(--surface-overlay, rgba(15, 23, 42, 0.94))",
        border: "1px solid var(--surface-overlay-border, rgba(255,255,255,0.18))",
        borderRadius: "var(--radius-md)",
        boxShadow:
          "var(--shadow-overlay, 0 18px 60px -16px rgba(0,0,0,0.65), 0 4px 16px -4px rgba(0,0,0,0.4))",
        backdropFilter: "blur(var(--surface-blur, 18px))",
        WebkitBackdropFilter: "blur(var(--surface-blur, 18px))",
        // backdrop-filter under transform — translateZ(0) + will-change keep
        // Chromium from dropping the filter during peek's frame transitions
        // ([[feedback_backdrop_filter_under_transform]])
        transform: "translateZ(0)",
        willChange: "backdrop-filter",
        isolation: "isolate",
        color: "var(--text-overlay, var(--text-strong))",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: "16px 16px 12px",
          borderBottom: "1px solid var(--surface-overlay-border, rgba(255,255,255,0.12))",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "var(--accent)",
              boxShadow: "0 0 12px var(--accent)",
            }}
          />
          <h2
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.4px",
              color: "var(--text-overlay, var(--text-strong))",
              textTransform: "uppercase",
            }}
          >
            Z-order stack
          </h2>
        </div>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 12,
            color: "var(--text-overlay-soft, var(--text-soft))",
            lineHeight: 1.5,
          }}
        >
          {metaLine()}
        </p>
      </header>

      {/* Body */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "6px 0",
        }}
      >
        {orderedTopDown.length === 0 ? (
          <div
            style={{
              padding: "44px 18px",
              textAlign: "center",
              color: "var(--text-overlay-muted, var(--text-muted))",
              fontSize: 12,
              lineHeight: 1.7,
            }}
          >
            <div
              aria-hidden
              style={{
                fontSize: 26,
                color: "var(--text-overlay-muted, rgba(255,255,255,0.32))",
                marginBottom: 6,
                letterSpacing: 4,
              }}
            >
              ▢ ▢ ▢
            </div>
            no overlapping items at cursor
          </div>
        ) : (
          orderedTopDown.map((id) => {
            const z = liftSet?.orderedIds.indexOf(id) ?? 0;
            const isDragging = draggingId === id;
            const isDropTarget = dropMark && dropMark.id === id ? dropMark.pos : null;
            return (
              <StackRow
                key={id}
                id={id}
                z={z}
                label={labelOf(id)}
                swatch={swatchOf(id)}
                isDragging={isDragging}
                isDropTarget={isDropTarget}
                onRowDragStart={() => {
                  const ok = controller.startDrag(id);
                  if (ok) setDraggingId(id);
                  return ok;
                }}
                onRowDragOver={(above) => {
                  setDropMark({ id, pos: above ? "above" : "below" });
                  // Translate inspector index (top-down) → controller rank.
                  const i = orderedTopDown.indexOf(id);
                  const targetRank = orderedTopDown.length - 1 - i;
                  controller.updateDrag(above ? targetRank + 1 : targetRank);
                }}
                onRowDrop={() => {
                  controller.endDrag(true);
                  setDropMark(null);
                  setDraggingId(null);
                }}
                onRowDragEnd={() => {
                  setDropMark(null);
                  if (draggingId !== null) {
                    controller.endDrag(false);
                    setDraggingId(null);
                  }
                }}
                onRowHover={() => {}}
              />
            );
          })
        )}
      </div>

      {/* Statusbar — action hint, no toggle */}
      <footer
        style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--surface-overlay-border, rgba(255,255,255,0.12))",
          fontSize: 11,
          color: "var(--text-overlay-muted, var(--text-muted))",
          fontFamily: "ui-monospace, 'SF Mono', monospace",
          flexShrink: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>drag to reorder</span>
        <span style={{ opacity: 0.7 }}>Esc · L · click ✕</span>
      </footer>
    </section>
  );
}
