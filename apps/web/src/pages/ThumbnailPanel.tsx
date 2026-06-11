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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  EditableText,
  type EditableTextHandle,
  IconCopy,
  IconDiamond,
  IconDocLines,
  IconFrame,
  IconPlus,
  IconSparkle,
  IconTrash,
} from "@weave/design-system";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  collectNonSlideFrameIds,
  effectivePresentationOrder,
  isSkippedFrame,
  reorder,
  reorderSet,
} from "../document/presentation-order.js";
import type { Design, DocFlavor } from "../document/types.js";
import { nn } from "../lib/nn.js";

interface Entry {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly isRoot: boolean;
  /** WI-184 ⑪ — `attrs.skipped` (PPT Hide Slide): stays in the deck, the
   *  show steps past it. The tile dims + strikes its number. */
  readonly skipped: boolean;
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
    return { id: targetId, title: designTitle, kind: "weave-doc", isRoot: true, skipped: false };
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
    skipped: isSkippedFrame(found),
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
  /** WI-072 — toggle a frame's deck membership. `presentable=false` removes it
   *  from the slide deck (it moves to the non-slide section); `true` re-adds it.
   *  The host dispatches `weave.item.update` setting `attrs.presentable`. */
  readonly onToggleSlide?: ((id: string, presentable: boolean) => void) | undefined;
  /** WI-153 P2 — add a new blank page (a top-level frame). When provided, a
   *  trailing "+" tile renders in the rail. WI-184 ⑩ — the host execs
   *  `weave.page.add`, which inserts the page right AFTER the current one
   *  (deck-end only when nothing is active) + makes it the active page. */
  readonly onAddPage?: (() => void) | undefined;
  /** WI-155 — duplicate a page in place. When provided, slide tiles render a
   *  footer copy action. The host execs `weave.page.duplicate` (offset-0 clone
   *  + presentationOrder insert-after, one undo) and activates the clone. */
  readonly onDuplicatePage?: ((id: string) => void) | undefined;
  /** Delete a page (remove the top-level frame). When provided, slide tiles
   *  render a footer trash action — but only while more than one page remains
   *  (a deck always keeps ≥ 1 page, so the last tile omits it). The host execs
   *  `weave.item.remove` and re-resolves the active page off the deleted one. */
  readonly onDeletePage?: ((id: string) => void) | undefined;
  /** WI-166 / DR-114 §4 — render the non-slide (deck-excluded frames)
   *  section. The host fills this from RailPolicy.nonSlideSection; the panel
   *  itself stays policy-free (same "declarative slot" idea as the optional
   *  callbacks above, but the section has no callback to elide). Default
   *  true (free-placement behavior). */
  readonly showNonSlideSection?: boolean | undefined;
  /** WI-184 ⑨ — enable rail multi-select: Shift+click = range from the last
   *  plain-clicked tile, Cmd/Ctrl+click = toggle membership. A >1 set turns
   *  the footer duplicate/delete into SET operations and a drag of any set
   *  member moves the whole set as a contiguous block. The host fills this
   *  from RailPolicy.multiSelect. Default false. */
  readonly multiSelect?: boolean | undefined;
  /** WI-184 ⑨ — duplicate a SET of pages in one undo step. The host execs
   *  `weave.pages.duplicate` (each clone slots right after its source) and
   *  activates the last clone. Falls back to onDuplicatePage when absent. */
  readonly onDuplicatePages?: ((ids: ReadonlyArray<string>) => void) | undefined;
  /** WI-184 ⑨ — delete a SET of pages in one undo step. The panel never
   *  offers a set delete that would empty the deck (≥ 1 page invariant, same
   *  rule as the single delete's last-page guard). The host execs
   *  `weave.items.remove` and re-resolves the active page off the set. */
  readonly onDeletePages?: ((ids: ReadonlyArray<string>) => void) | undefined;
  /** WI-184 ⑪ — rename a page from the tile's right-click menu. The host
   *  execs `weave.item.update` writing `attrs.title`. Providing this (or
   *  onToggleSkip) turns the tile into a context-menu trigger; the host fills
   *  both from RailPolicy.tileContextMenu. */
  readonly onRenamePage?: ((id: string, title: string) => void) | undefined;
  /** WI-184 ⑪ — toggle "skip in show" (PPT Hide Slide). The host execs
   *  `weave.item.update` writing `attrs.skipped`. A skipped page stays a
   *  fully editable deck member; only present-mode stepping walks past it
   *  (`presentationStepIds`). Deliberately distinct from the WI-072
   *  deck-membership toggle (`presentable: false` removes the tile). */
  readonly onToggleSkip?: ((id: string, skipped: boolean) => void) | undefined;
  /** WI-185 ⑯ — "새 페이지" from the tile menu: insert a blank page right
   *  AFTER this tile (the rail "+" inserts after the ACTIVE page instead). */
  readonly onAddPageAfter?: ((id: string) => void) | undefined;
  /** WI-185 ⑯ — "배경 변경": the host selects/activates the page so the
   *  contextual toolbar's frame-background section surfaces. */
  readonly onEditBackground?: ((id: string) => void) | undefined;
}

/** WI-184 ⑨ — stable empty set so collapsing the multi-select doesn't churn
 *  state identity on every plain click. */
const NO_MULTI: ReadonlySet<string> = new Set();

/** WI-072 — small "deck membership" glyph (stacked rectangles). Active = the
 *  frame IS a slide (click removes it); inactive = it is a group (click adds). */
function DeckGlyph({ active }: { readonly active: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={active ? "슬라이드" : "그룹"}
    >
      <title>{active ? "슬라이드" : "그룹"}</title>
      <rect x="3" y="8" width="13" height="13" rx="2" fill={active ? "currentColor" : "none"} />
      <path d="M8 8V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-3" />
    </svg>
  );
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
  onToggleSlide,
  onAddPage,
  onDuplicatePage,
  onDeletePage,
  showNonSlideSection = true,
  multiSelect = false,
  onDuplicatePages,
  onDeletePages,
  onRenamePage,
  onToggleSkip,
  onAddPageAfter,
  onEditBackground,
}: ThumbnailPanelProps) {
  // Keep useParams import so the panel still re-renders when route id changes.
  useParams<{ id: string }>();

  // WI-184 ⑨ — rail multi-select. Panel-local ephemeral UI state (the host
  // owns the ACTIVE page; this set only feeds the panel's own set ops). The
  // anchor is the last plain/Cmd-clicked tile — Shift+click ranges from it.
  // Stale ids (deleted pages) are harmless: every read intersects with the
  // live entries.
  const [multiSelected, setMultiSelected] = useState<ReadonlySet<string>>(NO_MULTI);
  const [anchorId, setAnchorId] = useState<string | null>(null);

  // WI-184 ⑪ — inline rename, entered via the tile's right-click menu. Only
  // one tile renames at a time, so a single handle ref suffices; the effect
  // places the caret at the end once the EditableText has mounted.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const renameRef = useRef<EditableTextHandle | null>(null);
  useEffect(() => {
    if (renamingId === null) return;
    // Deferred one tick: rename mode is entered from a Radix context-menu
    // item, and the closing menu restores focus to its trigger in its own
    // cleanup — focusEnd must land after that restore, not before.
    const t = window.setTimeout(() => renameRef.current?.focusEnd(), 0);
    return () => window.clearTimeout(t);
  }, [renamingId]);

  const order = effectivePresentationOrder(design);
  const entries = order
    .map((id) => findEntry(design.document.root, id, design.title))
    .filter((e): e is Entry => e !== undefined);
  // WI-072 — frames the user opted OUT of the deck, shown in a separate
  // section. WI-166: elided entirely when the rail policy says page-bounded
  // (one page renders at a time — "excluded from the deck" has no meaning).
  const nonSlideEntries = showNonSlideSection
    ? collectNonSlideFrameIds(design.document.root)
        .map((id) => findEntry(design.document.root, id, design.title))
        .filter((e): e is Entry => e !== undefined)
    : [];

  // Render nothing only when there are neither slides nor opted-out frames.
  if (entries.length === 0 && nonSlideEntries.length === 0) return null;

  const handleTileActivate = (entry: Entry) => {
    // WI-184 ⑨ — plain activation (click / arrow walk) collapses any
    // multi-select and re-anchors the range gesture on this tile.
    if (multiSelected !== NO_MULTI) setMultiSelected(NO_MULTI);
    setAnchorId(entry.id);
    onSelect?.(entry.id);
  };

  // WI-184 ⑨ — the set the footer actions / drag operate on, in DECK order
  // (not click order) so "duplicate set" interleaves clones predictably.
  const selectedSetIds = entries.filter((en) => multiSelected.has(en.id)).map((en) => en.id);

  // WI-184 ⑨ — modifier-aware tile click. Shift = range from the anchor
  // (PPT filmstrip), Cmd/Ctrl = toggle membership (a toggled-ON tile becomes
  // the active page; toggling OFF leaves the active page alone). An empty
  // set seeds itself from the active page so the first Cmd+click reads as
  // "current + this". Plain click falls through to single activation.
  const handleTileClick = (entry: Entry, idx: number, e: ReactMouseEvent<HTMLButtonElement>) => {
    if (multiSelect && e.shiftKey) {
      const base = anchorId ?? selectedId;
      const anchorIdx =
        base !== undefined && base !== null ? entries.findIndex((en) => en.id === base) : -1;
      if (anchorIdx >= 0) {
        const [a, b] = anchorIdx <= idx ? [anchorIdx, idx] : [idx, anchorIdx];
        setMultiSelected(new Set(entries.slice(a, b + 1).map((en) => en.id)));
        onSelect?.(entry.id);
        return;
      }
      // No anchor to range from — fall through to plain activation.
    } else if (multiSelect && (e.metaKey || e.ctrlKey)) {
      const next = new Set(
        multiSelected.size > 0 ? multiSelected : selectedId !== undefined ? [selectedId] : [],
      );
      if (next.has(entry.id)) {
        next.delete(entry.id);
      } else {
        next.add(entry.id);
        onSelect?.(entry.id);
      }
      setAnchorId(entry.id);
      setMultiSelected(next);
      return;
    }
    handleTileActivate(entry);
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

  // WI-184 ⑦ — rail focus model. Arrow keys on a tile's activation button
  // step the ACTIVE slide (filmstrip semantics: moving rail focus IS changing
  // the current slide — SLIDE_DECK_INTERACTION_SPEC §1e "포커스 규칙"). The
  // spec names ↑/↓; this rail is horizontal, so ←/→ are bound as the natural
  // pair too. Clamped at the deck ends (no wrap), disabled tiles (canvas
  // dim/iso gate) are stepped over, and DOM focus follows the activated tile
  // so repeated presses keep walking. stopPropagation keeps the canvas's
  // window keydown (arrow = nudge selection) out of the rail's arrow
  // semantics — rail focus means arrows move slides, never canvas items.
  const handleTileArrowKey = (idx: number, e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (dir === 0) return;
    e.preventDefault();
    e.stopPropagation();
    let next = idx + dir;
    let target = entries[next];
    while (target !== undefined && (disabledFrameIds?.has(target.id) ?? false)) {
      next += dir;
      target = entries[next];
    }
    if (target === undefined) return; // clamp at the deck ends (no wrap)
    handleTileActivate(target);
    const panel = e.currentTarget.closest("[data-testid='thumbnail-panel']");
    const btn = panel?.querySelector<HTMLButtonElement>(
      `[data-testid="thumbnail-activate-${next}"]`,
    );
    btn?.focus();
    btn?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
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
      {/* biome-ignore lint/a11y/useSemanticElements: intentional non-semantic element for this composite/overlay surface */}
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
          // WI-184 ⑨ — tile is part of a >1 multi-select set: footer actions
          // act on the SET, and a drag moves the whole set.
          const isMultiSelected = multiSelected.size > 1 && multiSelected.has(entry.id);
          const accentVar = DOMAIN_ACCENT_VAR[entry.kind] ?? "var(--accent)";
          // WI-184 ⑪ / WI-185 ⑯ — right-click affordances (new / duplicate /
          // delete / rename / skip-in-show / background). The presence of any
          // callback turns the tile into a context-menu trigger; disabled
          // (dim/iso-gated) tiles stay menu-free, matching every other
          // interaction gate on them.
          const hasTileMenu =
            !isDisabled &&
            (onRenamePage !== undefined ||
              onToggleSkip !== undefined ||
              onAddPageAfter !== undefined ||
              onEditBackground !== undefined);
          const isRenaming = renamingId === entry.id;
          const tile = (
            // AUDIT-003 V2 — the tile previously combined role="option"
            // (interactive WAI-ARIA role) with an inner `<button>` for the
            // focus-toggle, which axe-core flags as nested-interactive.
            // The fix is structural: the outer is now a non-interactive
            // `role="group"` wrapper that carries the layout + drag
            // affordances; tile activation moves to a full-coverage
            // inner `<button>`, which sits as a SIBLING of the absolute-
            // positioned focus-toggle `<button>`. Both inner controls
            // remain keyboard-accessible without nesting.
            // biome-ignore lint/a11y/useSemanticElements: intentional non-semantic element for this composite/overlay surface
            <div
              key={entry.id}
              role="group"
              aria-label={`Tile ${idx + 1}: ${entry.title}${entry.skipped ? " (건너뜀)" : ""}`}
              aria-disabled={isDisabled || undefined}
              // WI-184 ⑪ — dragging is suspended while renaming so a text
              // drag-select inside the contenteditable never starts a tile drag.
              draggable={!isDisabled && !isRenaming}
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
              data-multiselected={isMultiSelected || undefined}
              data-skipped={entry.skipped || undefined}
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
                // WI-184 ⑨ — dragging a member of the multi-select set moves
                // the whole set as one contiguous block (deck order kept);
                // any other drag stays the single-tile reorder. The set is
                // read from panel state, so the drag payload format is
                // unchanged (still just the source index).
                const draggedId = order[from];
                const dragsSet =
                  multiSelect &&
                  draggedId !== undefined &&
                  multiSelected.size > 1 &&
                  multiSelected.has(draggedId);
                setPresentationOrder(
                  dragsSet
                    ? reorderSet(order, multiSelected, from, idx)
                    : reorder(order, from, idx),
                );
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
                    : // WI-184 ⑨ — set members share the active page's accent
                      // border (the active one keeps its preview inset ring +
                      // aria-current as the distinguishing cue).
                      isSelected || isMultiSelected
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
                      : isSelected || isMultiSelected
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
                onClick={(e) => {
                  if (isDisabled) return;
                  handleTileClick(entry, idx, e); // WI-184 ⑨ — modifier-aware
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
                    return;
                  }
                  handleTileArrowKey(idx, e); // WI-184 ⑦
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
                className={
                  "relative flex-1 overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--surface-2-border)] flex items-center justify-center pointer-events-none" +
                  // WI-184 ⑪ — skipped slide: dimmed preview (PPT Hide Slide cue;
                  // the struck-through number below is the second half).
                  (entry.skipped ? " opacity-40" : "")
                }
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
                  className={
                    "font-mono text-[10px] font-semibold tracking-wide w-[18px] shrink-0" +
                    // WI-184 ⑪ — PPT Hide Slide cue: struck-through number.
                    (entry.skipped ? " line-through opacity-60" : "")
                  }
                  style={{
                    color: tileStage >= 1 ? "var(--accent-strong)" : "var(--text-muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
                {isRenaming ? (
                  // WI-184 ⑪ — inline rename (right-click → 이름 바꾸기).
                  // EditableText commits on blur AND Enter; Esc reverts the
                  // DOM text first so its commit() no-ops — exiting rename
                  // mode rides onBlur either way. `relative z-10` lifts the
                  // field above the inset-0 activation button (WI-101 rule).
                  <EditableText
                    ref={renameRef}
                    value={entry.title}
                    ariaLabel="페이지 이름 바꾸기"
                    data-testid={`thumbnail-rename-${idx}`}
                    onCommit={(next) => {
                      if (next.length > 0 && next !== entry.title) {
                        onRenamePage?.(entry.id, next);
                      }
                    }}
                    onEnterCommit={() => setRenamingId(null)}
                    onBlur={() => setRenamingId(null)}
                    className="relative z-10 text-[12px] leading-tight flex-1 min-w-0 text-[color:var(--text-strong)]"
                  />
                ) : (
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
                )}
                {/* WI-155 — per-page duplicate. Same footer-action pattern as
                    the deck toggle below (relative z-10 above the inset-0
                    activation button; hover-brightened). Disabled tiles omit
                    it — a gated frame ignores structural edits.
                    WI-184 ⑨ — on a multi-selected tile the action covers the
                    whole SET (one undo via weave.pages.duplicate). */}
                {onDuplicatePage !== undefined && !isDisabled ? (
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isMultiSelected && onDuplicatePages !== undefined) {
                        onDuplicatePages(selectedSetIds);
                        return;
                      }
                      onDuplicatePage(entry.id);
                    }}
                    data-testid={`thumbnail-duplicate-${idx}`}
                    aria-label={
                      isMultiSelected && onDuplicatePages !== undefined
                        ? `선택한 ${selectedSetIds.length}개 페이지 복제`
                        : "페이지 복제"
                    }
                    data-tip={
                      isMultiSelected && onDuplicatePages !== undefined
                        ? `선택한 ${selectedSetIds.length}개 페이지 복제`
                        : "페이지 복제"
                    }
                    className={
                      "shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-[var(--radius-sm)] " +
                      // WI-101 — lift above the absolute inset-0 z-0 activation
                      // button so the click reaches this action (see deck toggle).
                      "relative z-10 " +
                      "text-[color:var(--text-muted)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 " +
                      "hover:text-[color:var(--accent-strong)] hover:bg-[color:var(--surface-2)] " +
                      "focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]"
                    }
                  >
                    <IconCopy size={13} />
                  </button>
                ) : null}
                {/* Per-page delete. Kept subtly visible (not hover-only) so it
                    is discoverable at a glance — same opacity treatment as the
                    deck toggle. On the LAST remaining page it renders disabled
                    (a deck always keeps ≥ 1 page) instead of vanishing, so the
                    affordance never silently disappears. Gated tiles omit it.
                    WI-184 ⑨ — on a multi-selected tile the action deletes the
                    whole SET; a set covering every page disables it (the same
                    ≥ 1 invariant as the single delete's last-page guard). */}
                {onDeletePage !== undefined && !isDisabled
                  ? (() => {
                      const actsOnSet = isMultiSelected && onDeletePages !== undefined;
                      const wouldEmpty = actsOnSet
                        ? selectedSetIds.length >= entries.length
                        : entries.length <= 1;
                      return (
                        <button
                          type="button"
                          disabled={wouldEmpty}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (wouldEmpty) return;
                            if (actsOnSet) {
                              onDeletePages(selectedSetIds);
                              return;
                            }
                            onDeletePage(entry.id);
                          }}
                          data-testid={`thumbnail-delete-${idx}`}
                          aria-label={
                            actsOnSet
                              ? `선택한 ${selectedSetIds.length}개 페이지 삭제`
                              : "페이지 삭제"
                          }
                          data-tip={
                            wouldEmpty
                              ? actsOnSet
                                ? "덱의 모든 페이지를 삭제할 수 없습니다"
                                : "마지막 페이지는 삭제할 수 없습니다"
                              : actsOnSet
                                ? `선택한 ${selectedSetIds.length}개 페이지 삭제`
                                : "페이지 삭제"
                          }
                          className={
                            "shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-[var(--radius-sm)] " +
                            // WI-101 — lift above the absolute inset-0 z-0 activation
                            // button so the click reaches this action.
                            "relative z-10 " +
                            (wouldEmpty
                              ? "text-[color:var(--text-muted)] opacity-30 cursor-not-allowed "
                              : "text-[color:var(--text-muted)] opacity-60 group-hover:opacity-100 focus-visible:opacity-100 " +
                                "hover:text-[color:var(--danger,#e5484d)] hover:bg-[color:var(--surface-2)] ") +
                            "focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]"
                          }
                        >
                          <IconTrash size={13} />
                        </button>
                      );
                    })()
                  : null}
                {/* WI-072 — deck-membership toggle. On a slide tile it is
                    ACTIVE; clicking removes the frame from the deck (it drops to
                    the non-slide section). Hover-revealed to keep the footer
                    clean. */}
                {onToggleSlide !== undefined ? (
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSlide(entry.id, false);
                    }}
                    data-testid={`thumbnail-slide-toggle-${idx}`}
                    aria-label="슬라이드에서 제외 (그룹으로)"
                    data-tip="슬라이드(덱)에서 제외"
                    className={
                      "shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-[var(--radius-sm)] " +
                      // WI-101 — MUST be positioned above the full-coverage activation
                      // button (absolute inset-0 z-0): a static footer button paints
                      // UNDER it, so its click was swallowed by "select frame" and the
                      // toggle never fired. `relative z-10` lifts it into the click path.
                      "relative z-10 " +
                      // WI-072 — kept subtly visible (not hover-only) so deck
                      // membership is discoverable at a glance and reliably hit-
                      // testable; brightens on hover/focus.
                      "text-[color:var(--accent-strong)] opacity-60 group-hover:opacity-100 focus-visible:opacity-100 " +
                      "hover:bg-[color:var(--surface-2)] focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]"
                    }
                  >
                    <DeckGlyph active={true} />
                  </button>
                ) : null}
              </div>
            </div>
          );
          if (!hasTileMenu) return tile;
          // WI-184 ⑪ — right-click menu. Radix Root renders no DOM, so the
          // scroller's flex layout still sees the tile div as its child (the
          // Trigger merges onto the tile via asChild). The tile's key rides
          // along on the Root.
          return (
            <ContextMenu key={entry.id}>
              <ContextMenuTrigger asChild>{tile}</ContextMenuTrigger>
              <ContextMenuContent
                data-testid={`thumbnail-menu-${idx}`}
                // Radix restores focus to the trigger when the menu closes —
                // AFTER the exit animation, i.e. after our focusEnd() has put
                // the caret in the rename field. That restore would blur the
                // field and onBlur would exit rename mode instantly. Suppress
                // it only when rename was just entered; other dismissals keep
                // the default restore.
                onCloseAutoFocus={(e) => {
                  if (renamingId !== null) e.preventDefault();
                }}
              >
                {/* WI-185 ⑯ — page-lifecycle rows (the spec-§1e consensus
                    menu: New·Duplicate·Delete·Skip·배경). Duplicate/Delete
                    act on the multi-selected SET when the tile is part of
                    one — identical semantics to the hover buttons. */}
                {onAddPageAfter !== undefined ? (
                  <ContextMenuItem
                    data-testid={`thumbnail-menu-new-${idx}`}
                    onSelect={() => onAddPageAfter(entry.id)}
                  >
                    새 페이지
                  </ContextMenuItem>
                ) : null}
                {onDuplicatePage !== undefined ? (
                  <ContextMenuItem
                    data-testid={`thumbnail-menu-duplicate-${idx}`}
                    onSelect={() => {
                      if (isMultiSelected && onDuplicatePages !== undefined) {
                        onDuplicatePages(selectedSetIds);
                        return;
                      }
                      onDuplicatePage(entry.id);
                    }}
                  >
                    {isMultiSelected && onDuplicatePages !== undefined
                      ? `선택한 ${selectedSetIds.length}개 복제`
                      : "복제"}
                  </ContextMenuItem>
                ) : null}
                {onDeletePage !== undefined
                  ? (() => {
                      const actsOnSet = isMultiSelected && onDeletePages !== undefined;
                      // ≥ 1 page invariant — same guard as the hover delete.
                      const wouldEmpty = actsOnSet
                        ? selectedSetIds.length >= entries.length
                        : entries.length <= 1;
                      return (
                        <ContextMenuItem
                          data-testid={`thumbnail-menu-delete-${idx}`}
                          variant="danger"
                          disabled={wouldEmpty}
                          onSelect={() => {
                            if (wouldEmpty) return;
                            if (actsOnSet) {
                              nn(onDeletePages)(selectedSetIds);
                              return;
                            }
                            onDeletePage(entry.id);
                          }}
                        >
                          {actsOnSet ? `선택한 ${selectedSetIds.length}개 삭제` : "삭제"}
                        </ContextMenuItem>
                      );
                    })()
                  : null}
                {(onAddPageAfter !== undefined ||
                  onDuplicatePage !== undefined ||
                  onDeletePage !== undefined) &&
                (onRenamePage !== undefined || onToggleSkip !== undefined) ? (
                  <ContextMenuSeparator />
                ) : null}
                {onRenamePage !== undefined ? (
                  <ContextMenuItem
                    data-testid={`thumbnail-menu-rename-${idx}`}
                    onSelect={() => setRenamingId(entry.id)}
                  >
                    이름 바꾸기
                  </ContextMenuItem>
                ) : null}
                {onToggleSkip !== undefined ? (
                  <ContextMenuItem
                    data-testid={`thumbnail-menu-skip-${idx}`}
                    onSelect={() => onToggleSkip(entry.id, !entry.skipped)}
                  >
                    {entry.skipped ? "프레젠테이션에 포함" : "프레젠테이션에서 건너뛰기"}
                  </ContextMenuItem>
                ) : null}
                {onEditBackground !== undefined ? (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      data-testid={`thumbnail-menu-background-${idx}`}
                      onSelect={() => onEditBackground(entry.id)}
                    >
                      배경 변경
                    </ContextMenuItem>
                  </>
                ) : null}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
        {/* WI-153 P2 — add a blank page (Canva-style "+"). WI-184 ⑩: lands
            right after the current page, not at the deck end. */}
        {onAddPage !== undefined ? (
          <button
            type="button"
            onClick={onAddPage}
            data-testid="thumbnail-add-page"
            aria-label="페이지 추가"
            title="페이지 추가"
            className={
              "shrink-0 self-end flex items-center justify-center w-16 h-[124px] rounded-[var(--radius-md)] " +
              "border border-dashed border-[color:var(--border-default)] text-[color:var(--text-muted)] " +
              "transition-[background,border-color,color] duration-[var(--motion-quick)] " +
              "hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] hover:bg-[color:var(--surface-hover)] " +
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--accent)]"
            }
          >
            <IconPlus size={18} />
          </button>
        ) : null}
        {/* WI-072 — non-slide section: frames opted out of the deck. Visually
            separated (divider + label) and rendered as dimmed, dashed, numberless
            tiles. Still selectable; the deck toggle re-adds them. */}
        {nonSlideEntries.length > 0 ? (
          <>
            <div
              aria-hidden
              className="shrink-0 self-stretch my-2 w-px bg-[color:var(--border-default)]"
            />
            <div
              className="shrink-0 flex flex-col justify-end gap-1.5 pr-1 select-none"
              style={{ width: 56 }}
              aria-hidden
            >
              <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                그룹
              </span>
              <span className="text-[10px] text-[color:var(--text-muted)] tracking-wide">
                {nonSlideEntries.length}개
              </span>
            </div>
            {nonSlideEntries.map((entry) => {
              const isSelected = entry.id === selectedId;
              // WI-100 — group (excluded) tiles keep the focus eye too, so a frame
              // that is NOT in the deck can still be dimmed / isolated for editing
              // convenience exactly like a slide tile.
              const isFocused = entry.id === focusedId;
              const tileStage: FocusStage = isFocused ? focusStage : 0;
              const isDisabled = disabledFrameIds?.has(entry.id) ?? false;
              return (
                // biome-ignore lint/a11y/useSemanticElements: intentional non-semantic element for this composite/overlay surface
                <div
                  key={entry.id}
                  role="group"
                  aria-label={`Group frame: ${entry.title}`}
                  data-frame-id={entry.id}
                  data-frame-kind={entry.kind}
                  data-testid={`thumbnail-nonslide-${entry.id}`}
                  data-tile-stage={tileStage}
                  className={
                    "group relative flex flex-col w-[132px] h-[112px] p-2 gap-1.5 rounded-[var(--radius-md)] " +
                    "border border-dashed transition-[border-color,opacity] duration-[var(--motion-quick)] " +
                    "[filter:saturate(0.7)] opacity-80 hover:opacity-100 " +
                    (isSelected
                      ? "border-[color:var(--accent)] "
                      : "border-[color:var(--border-strong)] ")
                  }
                  style={{
                    background: "linear-gradient(var(--surface-1),var(--surface-1)),var(--bg-page)",
                  }}
                  data-tip={`그룹 프레임: ${entry.title}`}
                >
                  <button
                    type="button"
                    aria-label={`Activate ${entry.title}`}
                    aria-pressed={isSelected}
                    data-testid={`thumbnail-nonslide-activate-${entry.id}`}
                    onClick={() => onSelect?.(entry.id)}
                    onDoubleClick={() => onZoomToFrame?.(entry.id)}
                    className={
                      "absolute inset-0 z-0 rounded-[var(--radius-md)] bg-transparent border-0 cursor-pointer p-0 m-0 " +
                      "focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]"
                    }
                  />
                  <div
                    className="relative flex-1 overflow-hidden rounded-[var(--radius-sm)] border border-dashed border-[color:var(--surface-2-border)] flex items-center justify-center pointer-events-none"
                    style={{
                      background: design.background ?? "var(--surface-2)",
                      boxShadow:
                        tileStage >= 1
                          ? `inset 0 0 0 2px ${tileStage === 2 ? "var(--accent)" : "var(--accent-strong)"}`
                          : undefined,
                    }}
                    aria-hidden
                  >
                    <span
                      className="text-[22px] leading-none"
                      style={{
                        color: DOMAIN_ACCENT_VAR[entry.kind] ?? "var(--accent)",
                        opacity: 0.5,
                      }}
                    >
                      {FLAVOR_GLYPH[flavorIconForKind(entry.kind)]}
                    </span>
                    {/* WI-100 — focus (눈) toggle on group tiles too: a frame
                        excluded from the deck stays fully editable, so keep the
                        same dim/isolate convenience here. Identical control to the
                        slide tile's focus button (pointer-events-auto over the
                        pointer-events-none preview). */}
                    {onCycleFocus !== undefined ? (
                      <button
                        type="button"
                        disabled={isDisabled}
                        onClick={(e) => handleToggleClick(entry, e)}
                        onKeyDown={(e) => handleToggleKey(entry, e)}
                        onMouseDown={(e) => e.stopPropagation()}
                        data-testid={`thumbnail-nonslide-focus-${entry.id}`}
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
                          "pointer-events-auto " +
                          "border transition-[opacity,background,color,border-color] duration-[var(--motion-quick)] " +
                          "focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)] " +
                          "disabled:cursor-not-allowed disabled:pointer-events-none " +
                          (tileStage >= 1
                            ? "opacity-100 bg-[color:var(--accent)] text-[color:var(--text-on-accent)] border-[color:var(--accent)] "
                            : (isDisabled
                                ? "opacity-0 "
                                : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ") +
                              "bg-[rgba(0,0,0,0.42)] [backdrop-filter:blur(6px)] text-[color:var(--text-overlay-soft)] border-transparent hover:text-[color:var(--text-overlay)] ")
                        }
                      >
                        <FocusGlyph stage={tileStage} />
                      </button>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5 px-0.5">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--text-muted)] shrink-0">
                      그룹
                    </span>
                    <span className="text-[12px] leading-tight truncate flex-1 text-[color:var(--text-default)]">
                      {entry.title}
                    </span>
                    {onToggleSlide !== undefined ? (
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSlide(entry.id, true);
                        }}
                        data-testid={`thumbnail-nonslide-toggle-${entry.id}`}
                        aria-label="슬라이드로 포함"
                        data-tip="슬라이드(덱)에 추가"
                        className={
                          "shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-[var(--radius-sm)] " +
                          // WI-101 — lift above the absolute inset-0 z-0 activation
                          // button so the click reaches the toggle (see slide tile).
                          "relative z-10 " +
                          "text-[color:var(--text-muted)] hover:text-[color:var(--accent-strong)] " +
                          "hover:bg-[color:var(--surface-2)] focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]"
                        }
                      >
                        <DeckGlyph active={false} />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </>
        ) : null}
      </div>
    </section>
  );
}
