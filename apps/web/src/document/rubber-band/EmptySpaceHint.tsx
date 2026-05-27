// WI-017 Phase G — Empty-space hover hint.
//
// Companion to RubberBandLayer. When the host is idle and the cursor is
// over genuine empty space (or Alt is held over a child), this popover
// surfaces what can be built here — title + hint + the catalog of kinds
// the container accepts. Mirrors the AITooltip / KindTooltip information
// architecture (CONTEXT + actions) but for a rect-less hover.
//
// Portal-positioned via a Radix virtual ref so the popover sits in screen
// space, unaffected by the host's CSS transform (FrameStage's design
// plane is scaled).

import { Popover, PopoverAnchor, PopoverContent } from "@weave/design-system";
import { useMemo } from "react";
import type { InsertableHoverHint } from "../insertable/types.js";

export interface EmptySpaceHintProps {
  readonly open: boolean;
  readonly clientPoint: { readonly clientX: number; readonly clientY: number } | null;
  readonly hint: InsertableHoverHint | null;
  readonly altActive: boolean;
}

export function EmptySpaceHint({ open, clientPoint, hint, altActive }: EmptySpaceHintProps) {
  // Virtual anchor — a 1×1 rect at the cursor. Radix's Popover.Anchor
  // expects `virtualRef` as a `{ current: Measurable | null }` shape (it
  // calls `virtualRef?.current?.getBoundingClientRect()` internally).
  const virtualRef = useMemo(() => {
    if (clientPoint === null) return null;
    const { clientX, clientY } = clientPoint;
    const rect: DOMRect = {
      x: clientX,
      y: clientY,
      left: clientX,
      top: clientY,
      right: clientX + 1,
      bottom: clientY + 1,
      width: 1,
      height: 1,
      toJSON: () => ({}),
    } as DOMRect;
    return { current: { getBoundingClientRect: () => rect } };
  }, [clientPoint]);

  if (!open || virtualRef === null || hint === null) return null;

  return (
    <Popover open>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={14}
        collisionPadding={16}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        // Pointer-transparent so it never intercepts the drag start. The
        // hint is descriptive, not interactive.
        style={{ pointerEvents: "none" }}
        data-testid="rubber-band-empty-hint"
      >
        <div className="flex flex-col gap-2 min-w-[240px] max-w-[320px]">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-overlay-soft)]">
              {hint.title}
            </div>
            <kbd
              data-testid="rubber-band-empty-hint-alt-kbd"
              className={[
                "rounded-[var(--radius-sm)] border px-1.5 py-0.5 text-[10px] font-medium tracking-tight",
                altActive
                  ? "border-[color:var(--accent)] bg-[color:var(--accent)]/15 text-[color:var(--text-overlay)]"
                  : "border-[color:var(--surface-overlay-border)] bg-[color:var(--surface-overlay-2)] text-[color:var(--text-overlay-soft)]",
              ].join(" ")}
            >
              ⌥ drag
            </kbd>
          </div>
          <p className="text-[12px] leading-relaxed text-[color:var(--text-overlay)]">
            {hint.hint}
          </p>
          {hint.kinds.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" data-testid="rubber-band-empty-hint-kinds">
              {hint.kinds.map((k) => (
                <li
                  key={k.id}
                  className="flex items-center gap-1.5 rounded-full bg-[color:var(--surface-overlay-2)] px-2 py-0.5 text-[11px] text-[color:var(--text-overlay-soft)]"
                  data-testid={`rubber-band-empty-hint-kind-${k.id}`}
                >
                  {k.icon !== undefined ? (
                    <span
                      aria-hidden
                      className="text-[12px] leading-none text-[color:var(--accent-strong)]"
                    >
                      {k.icon}
                    </span>
                  ) : null}
                  {k.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
