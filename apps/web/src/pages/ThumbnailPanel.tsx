// WI-039 — bottom slide panel with z-order focus (two-stage).
//
// Each tile is a 2-zone card (preview slot + footer). Clicking the body
// selects the matching frame; dragging the tile reorders the presentation
// sequence. The preview-slot's focus toggle cycles three states:
//
//   off → stage 1 "dim" → stage 2 "isolate" → off
//
// • Off            — no effect on the canvas.
// • Stage 1 (dim)  — host fades EVERYTHING painted above the focused
//                    frame's subtree in z-order (later siblings of every
//                    ancestor, with their subtrees) AND blocks pointer
//                    events on them. The focused tree stays the sole
//                    interactive surface above the painted line.
// • Stage 2 (iso)  — host hides EVERYTHING outside the focused frame's
//                    subtree (every non-trail sibling at every ancestor)
//                    with full transparency AND blocks pointer events.
//                    Only the focused tree paints and accepts input.
//
// Shift-clicking the toggle jumps directly from off to stage 2 (power
// path). Esc on a focused toggle clears immediately. Only one tile may be
// focused at a time; cycling a different tile resets the previous tile.
//
// Panel-wide signal: while *any* tile is in stage 2 the other tiles
// desaturate / soften so the panel itself reflects the global lock.

import type { Item as AgocraftItem } from "@agocraft/core";
import { IconDiamond, IconDocLines, IconFrame, IconSparkle } from "@weave/design-system";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
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

// V6-3 (AUDIT-007) — kind→thumbnail-flavor as a frozen lookup table instead of
// a `switch (kind)` (Rule 6: no in-body branch on a discriminant). The keys are
// the RETIRED doc-kinds (`slide` / `canvas-design` / `block-doc` / `media`) that
// `migrate-frame-only.ts` rewrites away on load — the frame-only paradigm no
// longer produces them, so this map is closed and will never grow. It is kept
// only as a defensive shim so any not-yet-migrated persisted doc still maps to
// its historical glyph; every live kind falls through to `FRAME_KIND_FALLBACK`.
// Remove once the `allowedChildKinds` legacy-kind decommission lands.
const RETIRED_KIND_FLAVOR: Readonly<Record<string, DocFlavor>> = {
  slide: "slide-deck",
  "canvas-design": "canvas-board",
  "block-doc": "doc-page",
  media: "mixed",
};

function flavorIconForKind(kind: string): DocFlavor {
  return RETIRED_KIND_FLAVOR[kind] ?? FRAME_KIND_FALLBACK;
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
  /** Double-click a tile → bring its frame full-screen, the same camera
   *  fit applied when an item is added into a frame. */
  readonly onZoomToFrame?: ((id: string) => void) | undefined;
  /** WI-039 — frames whose edit interaction is currently blocked on the
   *  canvas (union of stage-1 dim + stage-2 isolate sets). Tiles for
   *  these frames render in a disabled state: no hover pop, no click-
   *  select, no drag-to-reorder, and keyboard Enter/Space is a no-op.
   *  The per-tile focus toggle button stays functional so the user can
   *  still cycle focus from any tile (otherwise stage 2 would lock the
   *  user out of switching focus to another slide). */
  readonly disabledFrameIds?: ReadonlySet<string> | undefined;
}

const FLAVOR_GLYPH: Readonly<Record<DocFlavor, ReactNode>> = {
  mixed: <IconSparkle size={22} />,
  "slide-deck": <IconFrame size={22} />,
  "canvas-board": <IconDiamond size={22} />,
  "doc-page": <IconDocLines size={22} />,
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
  disabledFrameIds,
  onCycleFocus,
  onClearFocus,
  onZoomToFrame,
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
    // Clicking the eye button also selects the frame — the user expects any
    // part of the tile (image area or eye) to make that frame the selection,
    // on top of the eye's own focus-cycle job.
    onSelect?.(entry.id);
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
      {/* AUDIT-003 V2 — paired with the tile change below. The previous
          role="listbox" required role="option" children, but options
          cannot contain interactive elements (the focus-toggle button
          is a `<button>` inside each tile). Demoted to a generic
          group so the focus-toggle nesting clears axe's
          nested-interactive rule; the keyboard nav is now driven by
          the inner activation `<button>`s being Tab-stops in order. */}
      <div
        className="relative pl-4 md:pl-6 pr-4 md:pr-6 pt-3 pb-2 flex items-end gap-4 overflow-x-auto"
        role="group"
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
          // WI-039 — tile-level "disabled" treatment for frames whose
          // canvas interaction is currently gated (stage-1 dim OR stage-2
          // isolate). Disabling the tile keeps the panel surface aligned
          // with the canvas surface: a frame that ignores edits on the
          // canvas also ignores clicks/hover/drag on its thumbnail.
          // Replaces the old `peerSoftened` heuristic (which only fired
          // in stage 2) — the new set is computed by the host as the
          // union of the dim + isolate sets, so stage 1 above-tree tiles
          // are now disabled too. Focused tiles are never in the set
          // (the host enforces) so they always stay interactive.
          const isDisabled = disabledFrameIds?.has(entry.id) ?? false;
          const accentVar = DOMAIN_ACCENT_VAR[entry.kind] ?? "var(--accent)";
          return (
            // AUDIT-003 V2 — the tile previously combined role="option"
            // (interactive WAI-ARIA role) with an inner `<button>` for the
            // focus-toggle, which axe-core flags as nested-interactive.
            // The fix is structural: the outer is now a non-interactive
            // `role="group"` wrapper that carries the layout + drag
            // affordances; tile activation moves to a full-coverage
            // inner `<button>`, which sits as a SIBLING of the absolute-
            // positioned focus-toggle `<button>`. Both inner controls
            // remain keyboard-accessible without nesting.
            <div
              key={entry.id}
              role="group"
              aria-label={`Tile ${idx + 1}: ${entry.title}`}
              aria-disabled={isDisabled || undefined}
              draggable={!isDisabled}
              data-thumbnail-id={entry.id}
              // WI-039 — also expose the frame id so the reparent drag
              // controller's `document.elementFromPoint` hit-test picks
              // up panel thumbnails as drop targets. The `data-frame-id`
              // attribute is the design-plane convention; thumbnails
              // join it for cross-surface drop without duplicating the
              // controller's target lookup.
              data-frame-id={entry.id}
              // WI-039 — non-disabled tiles also publish `data-frame-kind`
              // so `useHoverContext` (window-level pointer probe used by
              // the canvas) picks up tile hovers and the canvas's
              // HoverAffordanceLayer paints the corresponding frame as
              // hovered. The probe walks `closest("[data-frame-kind]")`,
              // reads `data-frame-id` as the id, and the projector treats
              // it identically to a canvas-side hover. Disabled tiles
              // omit this attribute so gated frames stay un-hovered
              // even when the pointer lands on their thumbnail.
              {...(isDisabled ? {} : { "data-frame-kind": entry.kind })}
              data-testid={`thumbnail-${idx}`}
              data-tile-stage={tileStage}
              data-disabled={isDisabled || undefined}
              onDragStart={(e) => {
                if (isDisabled) {
                  e.preventDefault();
                  return;
                }
                e.dataTransfer.setData(DRAG_MIME, String(idx));
                e.dataTransfer.effectAllowed = "move";
              }}
              // Drop targets remain valid even on disabled tiles — a non-
              // disabled tile dragged onto a disabled tile's slot should
              // still reorder into that index. The block is on STARTING
              // a drag from the disabled tile, not on RECEIVING one.
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
              // AUDIT-003 V2 — tile activation (click + keyboard) is now
              // delegated to a full-coverage inner `<button>` so the
              // outer wrapper stays a non-interactive role="group". See
              // the activation button rendered as the first child below.
              className={
                "group relative flex flex-col w-[160px] h-[124px] p-2 gap-1.5 rounded-[var(--radius-md)] " +
                "border transition-[background,border-color,box-shadow,filter,opacity,transform] duration-[var(--motion-quick)] " +
                // WI-039 follow-up (2026-05-27) — spring-y back-out curve
                // so hover pop / lift / glow read as a single coherent
                // physical motion instead of a flat ease. The 1.5 over-
                // shoot is subtle (≈4% past target) which makes the tile
                // feel like it "settles" without bouncing distractingly.
                "[transition-timing-function:cubic-bezier(0.34,1.5,0.5,1)] " +
                "focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)] " +
                // Cursor + drag affordance only when interactive.
                (isDisabled ? "cursor-not-allowed " : "cursor-grab active:cursor-grabbing ") +
                // WI-039 — hover pop. The tile scales 1.05× from its bottom
                // edge so the strip's baseline stays aligned; `z-10` lifts
                // the hovered tile above neighbours during the transition.
                // A small `-translate-y-[2px]` adds vertical lift, and a
                // soft accent glow (≤16px outward, kept inside the
                // strip's pt-3 = 12px overflow buffer by the negative
                // y-offset spread `-6px`) gives the tile a "lifted off
                // the panel" feel — animated via the same spring curve
                // above. Skipped for:
                //   • disabled tiles (gated frames — no hover affordance)
                //   • focused tiles (tileStage > 0) — they already carry
                //     accent border + glow + tint, the extra lift would
                //     push the glow past the strip's pt-3 overflow
                //     boundary and re-introduce the clipping it caused
                //     before this commit
                (isDisabled || tileStage > 0
                  ? ""
                  : "hover:scale-[1.05] hover:-translate-y-[2px] hover:z-10 " +
                    "focus-visible:scale-[1.05] focus-visible:-translate-y-[2px] focus-visible:z-10 " +
                    "hover:[box-shadow:0_8px_18px_-6px_var(--accent-soft),0_2px_6px_-2px_rgba(0,0,0,0.35)] " +
                    "focus-visible:[box-shadow:var(--focus-ring),0_8px_18px_-6px_var(--accent-soft)] " +
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
                // Disabled tiles — frame's canvas interaction is gated,
                // so the panel surface reflects it: desaturate +
                // brightness drop signals "inert" without going semi-
                // transparent (which would let the design canvas bleed
                // through the tile's overhang area). Same formula the
                // old `peerSoftened` branch used; the trigger is the new
                // explicit disabled set instead of stage===2.
                (isDisabled
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
              data-tip={`${idx + 1}. ${entry.title}`}
            >
              {/* AUDIT-003 V2 — full-coverage activation `<button>`.
                  Sibling of the absolute-positioned focus-toggle button
                  below, so neither is nested inside the other (the outer
                  `<div role="group">` is non-interactive). Visually
                  invisible — pointer-events on the surrounding content
                  flow through to this button via `inset-0` absolute
                  positioning. The focus-toggle (which sits above with a
                  higher z-index) captures clicks first when targeted,
                  while clicks elsewhere on the tile fall through to this
                  activation button. */}
              <button
                type="button"
                aria-label={`Activate ${entry.title}`}
                aria-pressed={isSelected}
                aria-current={isSelected ? "page" : undefined}
                disabled={isDisabled}
                tabIndex={isDisabled ? -1 : 0}
                data-testid={`thumbnail-activate-${idx}`}
                onClick={() => {
                  if (isDisabled) return;
                  handleTileActivate(entry);
                }}
                onDoubleClick={() => {
                  if (isDisabled) return;
                  onZoomToFrame?.(entry.id);
                }}
                onKeyDown={(e) => {
                  if (isDisabled) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleTileActivate(entry);
                  }
                }}
                className={
                  "absolute inset-0 z-0 rounded-[var(--radius-md)] " +
                  "bg-transparent border-0 cursor-pointer p-0 m-0 " +
                  "focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)] " +
                  "disabled:cursor-not-allowed"
                }
              />
              {/* Preview slot — placeholder until a real canvas snapshot
                    pipeline exists. Renders the design's background color so
                    different decks read at a glance even without a render.
                    The center glyph reads as a kind cue. */}
              <div
                // `pointer-events-none` lets clicks on the preview image area
                // fall through to the full-coverage activation button beneath
                // it (this `relative` slot otherwise paints above the z-0
                // button and would swallow the click → only the footer
                // selected). The focus-toggle button below re-enables itself
                // with `pointer-events-auto`.
                className="relative flex-1 overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--surface-2-border)] flex items-center justify-center pointer-events-none"
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
                      badge — the icon morph is the single lock cue.

                      When the tile itself is disabled (its frame is in
                      dim/iso set on the canvas), the button is also
                      disabled — "block everything inside" semantics. The
                      escape path from stage 2 is the FOCUSED tile's own
                      button (never in the disabled set). */}
                {onCycleFocus !== undefined ? (
                  <button
                    type="button"
                    disabled={isDisabled}
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
                    data-tip={nextStageLabel(tileStage)}
                    className={
                      "absolute top-1.5 right-1.5 inline-flex items-center justify-center w-6 h-6 rounded-[var(--radius-sm)] " +
                      // Re-enable hit-testing on the button: its parent preview
                      // slot is `pointer-events-none` so plain clicks reach the
                      // activation button, but the eye must stay clickable.
                      "pointer-events-auto " +
                      "border transition-[opacity,background,color,border-color] duration-[var(--motion-quick)] " +
                      "focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)] " +
                      "disabled:cursor-not-allowed disabled:pointer-events-none " +
                      (tileStage >= 1
                        ? "opacity-100 bg-[color:var(--accent)] text-[color:var(--text-on-accent)] border-[color:var(--accent)] "
                        : // Disabled tiles never reveal the eye on hover —
                          // tile-level interaction is gated, so the button
                          // affordance would only mislead. Stay at
                          // opacity-0 across hover and focus-visible.
                          (isDisabled
                            ? "opacity-0 "
                            : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ") +
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
