// Phase 10c-2 — bottom thumbnail panel.
//
// One tile per entry in `effectivePresentationOrder(design)`. Tiles are
// draggable; dropping one onto another rearranges the order (the tree
// itself is untouched). Clicking a tile drills into that document.
//
// Design choice: thumbnails show the doc's title + a kind chip — no
// rendered preview. A full visual thumbnail is a Phase 11+ ask (canvas
// snapshot + caching). The text + kind tile is enough to convey ordering.

import type { Item as AgocraftItem } from "@agocraft/core";
import { useParams } from "react-router-dom";
import type { Design, DocFlavor } from "../document/types.js";
import { FLAVOR_REGISTRY } from "../document/types.js";
import {
  effectivePresentationOrder,
  reorder,
} from "../document/presentation-order.js";

interface Entry {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly isRoot: boolean;
}

const FRAME_KIND_FALLBACK: DocFlavor = "mixed";

function flavorIconForKind(kind: string): DocFlavor {
  // Per-kind icon mapping reuses the flavor icon vocabulary so the panel
  // visually echoes the wizard's flavor tiles.
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

function findEntry(
  root: AgocraftItem,
  targetId: string,
  designTitle: string,
): Entry | undefined {
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
  const attrs = found.attrs as { title?: string; heading?: string; caption?: string; summary?: string };
  return {
    id: targetId,
    title:
      attrs.title ?? attrs.heading ?? attrs.caption ?? attrs.summary ?? "Untitled",
    kind: found.kind,
    isRoot: false,
  };
}

export interface ThumbnailPanelProps {
  readonly design: Design;
  readonly setPresentationOrder: (next: ReadonlyArray<string>) => void;
  /** Phase 11d — click a tile to *select* the matching frame, instead of
   *  drilling. Defers to the parent so DesignPage's selection state is the
   *  single source of truth. */
  readonly selectedId?: string | undefined;
  readonly onSelect?: ((id: string | undefined) => void) | undefined;
}

const FLAVOR_ICONS: Readonly<Record<DocFlavor, string>> = {
  mixed: "✦",
  "slide-deck": "▭",
  "canvas-board": "◇",
  "doc-page": "≡",
};

const DRAG_MIME = "application/x-weave-presentation-index";

export function ThumbnailPanel({
  design,
  setPresentationOrder,
  selectedId,
  onSelect,
}: ThumbnailPanelProps) {
  // Keep useParams import so the panel still re-renders when route id changes,
  // though /sub/* is gone in Phase 11.
  useParams<{ id: string }>();

  const order = effectivePresentationOrder(design);
  const entries = order
    .map((id) => findEntry(design.document.root, id, design.title))
    .filter((e): e is Entry => e !== undefined);

  const handleTileActivate = (entry: Entry) => {
    // Phase 11d — clicking a tile selects the underlying frame. Phase 12d
    // dropped the root tile entirely; every entry now resolves to a frame.
    onSelect?.(entry.id);
  };

  if (entries.length === 0) {
    // No frames yet — nothing to present, keep the panel hidden.
    return null;
  }

  return (
    <div
      className="shrink-0 px-4 md:px-6 py-2.5 bg-[color:var(--surface-1)] border-t border-[color:var(--surface-1-border)]"
      role="region"
      aria-label="Presentation order"
      data-testid="thumbnail-panel"
    >
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)] pr-2 shrink-0">
          Slides
        </span>
        {entries.map((entry, idx) => {
          const isCurrent = entry.id === selectedId;
          return (
            <button
              key={entry.id}
              type="button"
              draggable
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
              data-testid={`thumbnail-${idx}`}
              data-thumbnail-id={entry.id}
              aria-current={isCurrent ? "page" : undefined}
              className={
                "shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] border text-[12px] cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)] " +
                (isCurrent
                  ? "bg-[color:var(--accent-soft)] border-[color:var(--accent)]/40 text-[color:var(--text-strong)]"
                  : "bg-[color:var(--surface-2)] border-[color:var(--surface-2-border)] text-[color:var(--text-default)] hover:bg-[color:var(--surface-1)]")
              }
              title={`${idx + 1}. ${entry.title}`}
            >
              <span className="font-mono text-[10px] text-[color:var(--text-muted)] min-w-[14px] text-right">
                {idx + 1}
              </span>
              <span aria-hidden>{FLAVOR_ICONS[flavorIconForKind(entry.kind)]}</span>
              <span className="truncate max-w-[140px]">{entry.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
