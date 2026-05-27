// Cursor-anchored hover tooltip for canvas-internal items.
//
// The canvas hosts many small interactive items — shape rectangles inside a
// canvas frame, individual paragraphs in a doc frame, bullets and titles in
// a slide. Each one wants its own hover affordance ("선택 — 클릭", "편집 —
// 클릭", etc). Anchoring a separate target-bound tooltip per item would
// stack chrome and race the frame's tooltip; instead, a single popover
// follows the cursor and renders whichever item is currently under it.
//
// Items opt in by adding three data attributes:
//
//   data-hover-context="<one-line label>"
//   data-hover-actions='<json: [{ "action": "선택 — 클릭", "shortcut"?: "..." }]>'
//
// The popover reads them from the closest matching ancestor on every
// mousemove, parses the JSON, and renders an overlay-toned card pinned to
// the cursor (via Radix virtualRef). Suppressed when any non-idle/hand
// interaction mode is active so frame manipulation, rubber-band, panning
// and open context menus all silence the hover popover.
//
// Header tooltips on toolbar buttons stay on the AITooltip system (target-
// anchored, hide-buffer, hotkey table). Those are global UI affordances
// outside the canvas — different surface, different positioning rules.

import { Popover, PopoverAnchor, PopoverContent } from "@weave/design-system";
import { useEffect, useMemo, useState } from "react";
import { useTooltipsAllowed } from "../interactions/interaction-mode.js";

interface HoverAction {
  readonly action: string;
  readonly shortcut?: string;
}

interface HoverData {
  readonly clientX: number;
  readonly clientY: number;
  readonly context: string;
  readonly actions: ReadonlyArray<HoverAction>;
}

function parseActions(raw: string | null): ReadonlyArray<HoverAction> {
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is HoverAction =>
        typeof a === "object" &&
        a !== null &&
        typeof (a as { action: unknown }).action === "string",
    );
  } catch {
    return [];
  }
}

export function CursorTooltip() {
  const [hover, setHover] = useState<HoverData | null>(null);
  const tooltipsAllowed = useTooltipsAllowed();

  useEffect(() => {
    if (!tooltipsAllowed) {
      setHover(null);
      return undefined;
    }
    const onMove = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) {
        setHover(null);
        return;
      }
      const el = t.closest("[data-hover-context]");
      if (el === null) {
        setHover(null);
        return;
      }
      const context = el.getAttribute("data-hover-context") ?? "";
      if (context === "") {
        setHover(null);
        return;
      }
      const actions = parseActions(el.getAttribute("data-hover-actions"));
      setHover({ clientX: e.clientX, clientY: e.clientY, context, actions });
    };
    const onLeave = (e: MouseEvent) => {
      // mouseout to window — bail when the pointer leaves the viewport.
      if (e.relatedTarget === null) setHover(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseout", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
    };
  }, [tooltipsAllowed]);

  // Virtual anchor — a 1×1 rect at the cursor. Radix's Popover.Anchor
  // expects `virtualRef` as a `{ current: Measurable | null }` shape.
  const virtualRef = useMemo(() => {
    if (hover === null) return null;
    const { clientX, clientY } = hover;
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
  }, [hover]);

  if (hover === null || virtualRef === null) return null;

  return (
    <Popover open>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        side="right"
        align="start"
        sideOffset={14}
        collisionPadding={16}
        // Pointer-transparent — the tooltip is descriptive, not interactive,
        // and must never intercept the user's gesture on the item beneath.
        style={{ pointerEvents: "none" }}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        data-testid="cursor-tooltip"
      >
        <div className="flex flex-col gap-1 min-w-[160px] max-w-[280px]">
          <span className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-overlay-soft)]">
            Context
          </span>
          <span className="text-[13px] text-[color:var(--text-overlay)]">{hover.context}</span>
          {hover.actions.length > 0 ? (
            <ul className="mt-1.5 flex flex-col gap-1 text-[12px] text-[color:var(--text-overlay)]">
              {hover.actions.map((a, i) => (
                <li
                  // Action strings are user-supplied; positional dedup is the
                  // honest key since the same trigger can legitimately repeat.
                  // biome-ignore lint/suspicious/noArrayIndexKey: see comment
                  key={`${i}-${a.action}`}
                  className="flex items-center gap-2"
                >
                  <span aria-hidden className="text-[color:var(--accent-strong)]">
                    ▸
                  </span>
                  <span className="flex-1">{a.action}</span>
                  {a.shortcut !== undefined ? (
                    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded-[var(--radius-sm)] border bg-[color:var(--surface-overlay-2)] border-[color:var(--surface-overlay-border-strong)] text-[11px] font-mono tracking-[0.04em] text-[color:var(--text-overlay)]">
                      {a.shortcut}
                    </kbd>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
