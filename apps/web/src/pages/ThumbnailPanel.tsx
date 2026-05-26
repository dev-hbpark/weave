// WI-039 — bottom slide panel with z-order focus (two-stage).
//
// Each tile is a 2-zone card (preview slot + footer). Clicking the body
// selects the matching frame; dragging the tile reorders the presentation
// sequence. The preview-slot's focus toggle cycles three states:
//
//   off → stage 1 "dim" → stage 2 "isolate" → off
//
// • Off            — no effect on the canvas.
// • Stage 1 (dim)  — host fades sibling frames painted above the focused
//                    one; pointer events still flow.
// • Stage 2 (iso)  — host *also* blocks pointer events on those siblings,
//                    so the focused frame becomes the sole editable surface.
//
// Shift-clicking the toggle jumps directly from off to stage 2 (power
// path). Esc on a focused toggle clears immediately. Only one tile may be
// focused at a time; cycling a different tile resets the previous tile.
//
// Panel-wide signal: while *any* tile is in stage 2 the other tiles
// desaturate / soften so the panel itself reflects the global lock.

import type { Item as AgocraftItem } from "@agocraft/core";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useParams } from "react-router-dom";
import { effectivePresentationOrder, reorder } from "../document/presentation-order.js";
import type { Design, DocFlavor } from "../document/types.js";

interface Entry {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly isRoot: boolean;
}

const FRAME_KIND_FALLBACK: DocFlavor = "mixed";

function flavorIconForKind(kind: string): DocFlavor {
  switch (kind) {
    case "slide":
      return "slide-deck";
    case "canvas-design":
      return "canvas-board";
    case "block-doc":
      return "doc-page";
    case "media":
      return "mixed";
    default:
      return FRAME_KIND_FALLBACK;
  }
}

function findEntry(root: AgocraftItem, targetId: string, designTitle: string): Entry | undefined {
  if (String(root.id) === targetId) {
    return { id: targetId, title: designTitle, kind: "weave-doc", isRoot: true };
  }
  function walk(item: AgocraftItem): AgocraftItem | undefined {
    for (const c of item.children) {
      if (String(c.id) === targetId) return c;
      const f = walk(c);
      if (f !== undefined) return f;
    }
    return undefined;
  }
  const found = walk(root);
  if (found === undefined) return undefined;
  const attrs = found.attrs as {
    title?: string;
    heading?: string;
    caption?: string;
    summary?: string;
  };
  return {
    id: targetId,
    title: attrs.title ?? attrs.heading ?? attrs.caption ?? attrs.summary ?? "Untitled",
    kind: found.kind,
    isRoot: false,
  };
}

export type FocusStage = 0 | 1 | 2;

export interface ThumbnailPanelProps {
  readonly design: Design;
  readonly setPresentationOrder: (next: ReadonlyArray<string>) => void;
  readonly selectedId?: string | undefined;
  readonly onSelect?: ((id: string | undefined) => void) | undefined;
  /** WI-039 — the id of the currently focused frame, or undefined when no
   *  tile is focused. */
  readonly focusedId?: string | undefined;
  /** WI-039 — the stage of the focused frame: 0 = none, 1 = dim only,
   *  2 = dim + pointer-events block. The same numbers map to the panel-
   *  level data attribute so peer-tile desaturation can react via CSS. */
  readonly focusStage?: FocusStage;
  /** WI-039 — cycle the focus for one tile. The host owns the state
   *  machine (off → dim → isolate → off and "switch tile → restart at
   *  dim"). The optional `skipToIsolate` flag is the shift-click power
   *  path: off → isolate directly. */
  readonly onCycleFocus?: ((id: string, opts?: { skipToIsolate?: boolean }) => void) | undefined;
  /** WI-039 — drop focus completely (Esc inside the toggle). */
  readonly onClearFocus?: (() => void) | undefined;
}

const FLAVOR_GLYPH: Readonly<Record<DocFlavor, string>> = {
  mixed: "✦",
  "slide-deck": "▭",
  "canvas-board": "◇",
  "doc-page": "≡",
};

const DOMAIN_ACCENT_VAR: Readonly<Record<string, string>> = {
  slide: "var(--domain-slide-accent)",
  "canvas-design": "var(--domain-canvas-accent)",
  "block-doc": "var(--domain-block-accent)",
  media: "var(--domain-media-accent)",
};

const DRAG_MIME = "application/x-weave-presentation-index";

/** Triple-state eye icon — single glyph morph across all three stages.
 *
 *  • stage 0 (Off):     outlined open eye, hollow pupil
 *  • stage 1 (Dim):     outlined open eye, filled pupil — "looking at this"
 *  • stage 2 (Isolate): closed / struck-through eye (lucide `eye-off`) —
 *                       "this is locked from interaction"
 *
 *  Stage 2 uses the eye-off shape (closed lid + diagonal strike) so the
 *  *same* icon carries the lock semantics; the previous lock-badge addon
 *  in the thumbnail's preview slot is gone. The button itself remains
 *  the single triple-state control. */
function FocusGlyph({ stage }: { readonly stage: FocusStage }) {
  const label = stage === 0 ? "Focus" : stage === 1 ? "Dim active" : "Isolate active";
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {stage === 2 ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <path d="M1 1l22 22" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" fill={stage === 1 ? "currentColor" : "none"} />
        </>
      )}
    </svg>
  );
}

function nextStageLabel(stage: FocusStage): string {
  if (stage === 0) return "이 프레임만 강조 — 위 레이어 흐리게";
  if (stage === 1) return "한 번 더 — 위 레이어 클릭 차단";
  return "한 번 더 — 포커스 해제";
}

function ariaPressedFor(stage: FocusStage): boolean | "mixed" {
  if (stage === 2) return true;
  if (stage === 1) return "mixed";
  return false;
}

export function ThumbnailPanel({
  design,
  setPresentationOrder,
  selectedId,
  onSelect,
  focusedId,
  focusStage = 0,
  onCycleFocus,
  onClearFocus,
}: ThumbnailPanelProps) {
  // Keep useParams import so the panel still re-renders when route id changes.
  useParams<{ id: string }>();

  const order = effectivePresentationOrder(design);
  const entries = order
    .map((id) => findEntry(design.document.root, id, design.title))
    .filter((e): e is Entry => e !== undefined);

  if (entries.length === 0) return null;

  const handleTileActivate = (entry: Entry) => {
    onSelect?.(entry.id);
  };

  const handleToggleClick = (entry: Entry, e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (onCycleFocus === undefined) return;
    onCycleFocus(entry.id, { skipToIsolate: e.shiftKey });
  };

  const handleToggleKey = (entry: Entry, e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      onClearFocus?.();
      return;
    }
    if (e.key === " " || e.key === "Enter") {
      e.stopPropagation();
      e.preventDefault();
      onCycleFocus?.(entry.id, { skipToIsolate: e.shiftKey });
    }
  };

  return (
    <section
      className="shrink-0 relative"
      aria-label="Slide order and z-order focus"
      data-testid="thumbnail-panel"
      data-focus-stage={focusStage}
    >
      {/* Visual panel chrome — anchored to the bottom and intentionally
          shorter than the tile so each thumbnail's top edge pokes up
          above the panel band (Figma-style "tiles sit on top of the
          panel" silhouette). `pointer-events: none` keeps clicks
          flowing to the strip above; `aria-hidden` keeps screen
          readers focused on the listbox.

          Opaque self-background: the panel now sits over the design
          canvas (z-stack), so the previous translucent `--surface-1`
          would let the user's design color (often white) bleed
          through. Stack the same translucent `--surface-1` tint on top
          of an opaque `--bg-page` base — the perceived color matches
          the original dark-glass chrome but no longer depends on the
          parent's bg. Header uses the identical formula. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 border-t border-[color:var(--surface-1-border)] pointer-events-none"
        style={{
          height: 100,
          background: "linear-gradient(var(--surface-1), var(--surface-1)), var(--bg-page)",
        }}
      />
      {/* The horizontal scroller. `items-end` anchors every tile's
          bottom to the panel band's bottom (via the `pb-2` floor), so
          the tile's top edge rises *above* the band by
          (tileHeight + padTop + padBottom − bandHeight).
          `pt-3` is the hover-pop ceiling — `scale(1.05)` on a 124px
          tile grows the top by ~3px, which fits inside the 12px
          padding so the scroller's vertical overflow never clips. */}
      <div
        className="relative pl-4 md:pl-6 pr-4 md:pr-6 pt-3 pb-2 flex items-end gap-4 overflow-x-auto"
        role="listbox"
        aria-label="Slide thumbnails"
      >
        {/* Inline info column — fixed width so the Focused / Isolated
            pill toggling on and off never reflows the thumbnail
            positions. 80px fits "Isolated" (the longest label) plus the
            pill padding with a small margin. */}
        <div
          className="shrink-0 flex flex-col justify-end gap-1.5 pr-2 select-none"
          style={{ width: 80 }}
          aria-hidden
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
            Slides
          </span>
          {/* Reserve the second slot's vertical room with a min-height
              so swapping between count text and the pill doesn't change
              the column's height (the column is bottom-aligned, so any
              height jitter would visibly shift "Slides" up/down). */}
          <div style={{ minHeight: 18 }}>
            {focusStage > 0 ? (
              <span
                className={
                  "text-[10px] font-semibold uppercase tracking-[0.10em] px-2 py-0.5 rounded-[var(--radius-pill)] inline-block " +
                  (focusStage === 2
                    ? "bg-[color:var(--accent)] text-[color:var(--text-on-accent)]"
                    : "bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]")
                }
                data-testid="thumbnail-focus-active"
                data-focus-stage={focusStage}
              >
                {focusStage === 2 ? "Isolated" : "Focused"}
              </span>
            ) : (
              <span className="text-[10px] text-[color:var(--text-muted)] tracking-wide">
                {entries.length}개
              </span>
            )}
          </div>
        </div>
        {entries.map((entry, idx) => {
          const isSelected = entry.id === selectedId;
          const isFocused = entry.id === focusedId;
          const tileStage: FocusStage = isFocused ? focusStage : 0;
          // Peer-tile soften: when *any* tile is in stage 2, the non-focused
          // tiles desaturate + dim. This carries the "global lock" signal
          // across the whole strip so the user perceives the isolation at
          // a glance instead of only on the focused tile.
          const peerSoftened = focusStage === 2 && !isFocused;
          const accentVar = DOMAIN_ACCENT_VAR[entry.kind] ?? "var(--accent)";
          return (
            <div
              key={entry.id}
              role="option"
              aria-selected={isSelected}
              aria-current={isSelected ? "page" : undefined}
              tabIndex={0}
              draggable
              data-thumbnail-id={entry.id}
              data-testid={`thumbnail-${idx}`}
              data-tile-stage={tileStage}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_MIME, String(idx));
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(DRAG_MIME)) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const raw = e.dataTransfer.getData(DRAG_MIME);
                const from = Number(raw);
                if (!Number.isInteger(from)) return;
                setPresentationOrder(reorder(order, from, idx));
              }}
              onClick={() => handleTileActivate(entry)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleTileActivate(entry);
                }
              }}
              className={
                "group relative flex flex-col w-[160px] h-[124px] p-2 gap-1.5 rounded-[var(--radius-md)] " +
                "border transition-[background,border-color,box-shadow,filter,opacity,transform] duration-[var(--motion-quick)] " +
                "cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)] " +
                // WI-039 — hover pop. The tile scales 1.05× from its bottom
                // edge so the strip's baseline stays aligned; `z-10` lifts
                // the hovered tile above neighbours during the transition.
                // Skipped for:
                //   • peer-softened tiles (global-lock signal takes priority)
                //   • focused tiles (tileStage > 0) — they already carry
                //     accent border + glow + tint, the extra +6px lift
                //     would push the glow past the strip's pt-3 overflow
                //     boundary and re-introduce the clipping it caused
                //     before this commit
                (peerSoftened || tileStage > 0
                  ? ""
                  : "hover:scale-[1.05] hover:z-10 focus-visible:scale-[1.05] focus-visible:z-10 " +
                    // Hover tint swap — driven by --tile-tint CSS variable
                    // so the multi-bg formula (tint over opaque bg-page)
                    // stays declarative. Only applied when the tile is
                    // in its default state; selected state owns its own
                    // tint that hover should not overwrite.
                    (!isSelected
                      ? "hover:[--tile-tint:var(--surface-2)] hover:border-[color:var(--border-strong)] "
                      : "")) +
                // Stage 2 glow — kept tight (≤10px outward) so it stays
                // inside the strip's pt-3 = 12px overflow buffer. The
                // theme's `--shadow-glow` token reaches ~24-60px outward
                // which gets visibly clipped by the horizontal scroller
                // (overflow-x:auto forces overflow-y:auto per spec).
                // Two-layer accent halo reads as locked without spilling
                // past the panel ceiling.
                (tileStage === 2
                  ? "border-[color:var(--accent)] [box-shadow:0_0_10px_0_var(--accent),0_0_3px_0_var(--accent)] "
                  : tileStage === 1
                    ? "border-[color:var(--accent-strong)] "
                    : isSelected
                      ? "border-[color:var(--accent)] "
                      : "border-[color:var(--surface-1-border)] ") +
                // Peer-softened tiles — when another tile is in stage 2,
                // every non-focused tile recedes. The previous treatment
                // (opacity-50 + saturate) made the tile semi-transparent
                // so the design canvas bled through the tile's top half
                // (the part that overhangs the panel band), creating a
                // visible step between panel-bg and design-bg. Drop the
                // opacity entirely; keep the tile fully opaque and signal
                // "inert" via desaturation + brightness drop only. The
                // tile reads as a darker, calmer sibling without breaking
                // the panel's continuous surface.
                (peerSoftened
                  ? "[filter:saturate(var(--focus-peer-saturate,0.55))_brightness(0.62)] "
                  : "")
              }
              // WI-039 — opaque tile via tint-over-bg-page multi-bg, same
              // pattern as the header and the bottom panel band so the
              // canvas behind never bleeds through. The current state
              // chooses the tint; the base stays `--bg-page` always.
              style={
                {
                  transformOrigin: "center bottom",
                  "--tile-tint":
                    tileStage > 0
                      ? "var(--accent-soft)"
                      : isSelected
                        ? "var(--surface-2)"
                        : "var(--surface-1)",
                  background: "linear-gradient(var(--tile-tint), var(--tile-tint)), var(--bg-page)",
                } as CSSProperties
              }
              title={`${idx + 1}. ${entry.title}`}
            >
              {/* Preview slot — placeholder until a real canvas snapshot
                    pipeline exists. Renders the design's background color so
                    different decks read at a glance even without a render.
                    The center glyph reads as a kind cue. */}
              <div
                className="relative flex-1 overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--surface-2-border)] flex items-center justify-center"
                style={{
                  background: design.background ?? "var(--surface-2)",
                  boxShadow:
                    tileStage >= 1
                      ? `inset 0 0 0 2px ${tileStage === 2 ? "var(--accent)" : "var(--accent-strong)"}`
                      : isSelected
                        ? "inset 0 0 0 1px var(--accent)"
                        : undefined,
                }}
                aria-hidden
              >
                <span
                  className="text-[22px] leading-none"
                  style={{ color: accentVar, opacity: 0.55 }}
                >
                  {FLAVOR_GLYPH[flavorIconForKind(entry.kind)]}
                </span>
                {/* Focus toggle — top-right inside the preview. Hover-
                      revealed unless the tile is already focused (then
                      it stays anchored visible so the user can step
                      forward or unfocus). Stage 2 is signalled by the
                      eye-off shape of this very button, not by an extra
                      badge — the icon morph is the single lock cue. */}
                {onCycleFocus !== undefined ? (
                  <button
                    type="button"
                    onClick={(e) => handleToggleClick(entry, e)}
                    onKeyDown={(e) => handleToggleKey(entry, e)}
                    onMouseDown={(e) => e.stopPropagation()}
                    data-testid={`thumbnail-focus-${idx}`}
                    data-thumbnail-focus-id={entry.id}
                    data-stage={tileStage}
                    aria-label={
                      tileStage === 0
                        ? "Focus this frame"
                        : tileStage === 1
                          ? "Focused: dimming layers above"
                          : "Isolated: above layers locked"
                    }
                    aria-pressed={ariaPressedFor(tileStage)}
                    title={nextStageLabel(tileStage)}
                    className={
                      "absolute top-1.5 right-1.5 inline-flex items-center justify-center w-6 h-6 rounded-[var(--radius-sm)] " +
                      "border transition-[opacity,background,color,border-color] duration-[var(--motion-quick)] " +
                      "focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)] " +
                      (tileStage >= 1
                        ? "opacity-100 bg-[color:var(--accent)] text-[color:var(--text-on-accent)] border-[color:var(--accent)] "
                        : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 " +
                          "bg-[rgba(0,0,0,0.42)] [backdrop-filter:blur(6px)] text-[color:var(--text-overlay-soft)] border-transparent hover:text-[color:var(--text-overlay)] ")
                    }
                  >
                    <FocusGlyph stage={tileStage} />
                  </button>
                ) : null}
              </div>
              {/* Footer — number + truncated title. Number uses tabular
                    nums via font-feature so a 1- vs 2-digit count keeps
                    the title's baseline aligned across tiles. */}
              <div className="flex items-baseline gap-1.5 px-0.5">
                <span
                  className="font-mono text-[10px] font-semibold tracking-wide w-[18px] shrink-0"
                  style={{
                    color: tileStage >= 1 ? "var(--accent-strong)" : "var(--text-muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span
                  className={
                    "text-[12px] leading-tight truncate flex-1 " +
                    (tileStage >= 1 || isSelected
                      ? "text-[color:var(--text-strong)] font-medium"
                      : "text-[color:var(--text-default)]")
                  }
                >
                  {entry.title}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
