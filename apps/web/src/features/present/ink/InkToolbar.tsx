// WI-239 Phase 1 — present-mode ink toolbar (screen-space chrome, sibling of
// Stage). Compact launcher when ink is off; full controls when engaged.
// Dark-glass chips mirror PresentChrome so the bar reads on any slide color.

import { IconPencil, IconRedo, IconTrash, IconUndo } from "@weave/design-system";
import type { ReactNode } from "react";
import { INK_TOOL_ORDER, inkTool, isDrawTool } from "./ink-tools.js";
import type { LiveSession } from "./relay/use-live-session.js";
import type { InkSurfaceKey } from "./types.js";
import { INK_COLORS, INK_WIDTHS, type InkController } from "./use-ink-mode.js";
import type { InkSession } from "./use-ink-session.js";

const CHIP_BG = "rgba(15, 23, 42, 0.62)";
const CHIP_BG_ACTIVE = "rgba(99, 102, 241, 0.85)";
const CHIP_BORDER = "rgba(255, 255, 255, 0.14)";
const CHIP_TEXT = "rgba(255, 255, 255, 0.96)";

/** Per-tool glyph — a registry, not a `switch (toolId)`. Pen reuses the
 *  design-system icon; the ink-specific marks (highlighter, eraser) are local
 *  app glyphs so the shared Icon set stays domain-neutral. */
const TOOL_ICON: Readonly<Record<string, ReactNode>> = {
  pen: <IconPencil size={16} />,
  highlighter: <HighlighterGlyph />,
  eraser: <EraserGlyph />,
};

interface InkToolbarProps {
  readonly controller: InkController;
  readonly session: InkSession;
  /** The surface CLEAR / UNDO act on — the open board, else the active slide. */
  readonly activeSurfaceKey: InkSurfaceKey;
  /** WI-240 — live session controls; omitted/unavailable hides the cluster. */
  readonly live?: LiveSession;
}

export function InkToolbar({ controller, session, activeSurfaceKey, live }: InkToolbarProps) {
  const c = controller;
  const drawing = isDrawTool(c.toolId);

  return (
    <div
      data-testid="ink-toolbar"
      className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-2 py-1.5 rounded-[var(--radius-pill)] backdrop-blur-[8px] border"
      style={{ background: CHIP_BG, borderColor: CHIP_BORDER }}
    >
      <ChipButton
        label={c.enabled ? "Stop drawing" : "Draw on slide"}
        active={c.enabled}
        onClick={c.toggleEnabled}
        testid="ink-toggle"
      >
        <IconPencil size={16} />
      </ChipButton>

      {c.enabled ? (
        <>
          <Divider />
          {INK_TOOL_ORDER.map((id) => (
            <ChipButton
              key={id}
              label={inkTool(id).label}
              active={c.toolId === id}
              onClick={() => c.setToolId(id)}
              testid={`ink-tool-${id}`}
            >
              {TOOL_ICON[id] ?? <IconPencil size={16} />}
            </ChipButton>
          ))}

          {drawing ? (
            <>
              <Divider />
              <div className="flex items-center gap-1" data-testid="ink-colors">
                {INK_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    aria-label={`Color ${col}`}
                    data-active={c.color === col ? "true" : undefined}
                    onClick={() => c.setColor(col)}
                    className="w-5 h-5 rounded-full border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                    style={{
                      background: col,
                      borderColor: c.color === col ? CHIP_TEXT : CHIP_BORDER,
                      boxShadow: c.color === col ? "0 0 0 2px rgba(255,255,255,0.5)" : undefined,
                    }}
                  />
                ))}
              </div>
              <Divider />
              <div className="flex items-center gap-1" data-testid="ink-widths">
                {INK_WIDTHS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    aria-label={`Width ${w}`}
                    data-active={c.width === w ? "true" : undefined}
                    onClick={() => c.setWidth(w)}
                    className="w-7 h-7 rounded-[var(--radius-pill)] flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                    style={{ background: c.width === w ? CHIP_BG_ACTIVE : "transparent" }}
                  >
                    <span
                      className="rounded-full"
                      style={{ width: w + 2, height: w + 2, background: CHIP_TEXT }}
                    />
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <Divider />
          <ChipButton
            label="Undo"
            disabled={!session.canUndo}
            onClick={session.undo}
            testid="ink-undo"
          >
            <IconUndo size={16} />
          </ChipButton>
          <ChipButton
            label="Redo"
            disabled={!session.canRedo}
            onClick={session.redo}
            testid="ink-redo"
          >
            <IconRedo size={16} />
          </ChipButton>
          <ChipButton
            label="Clear slide"
            onClick={() => session.clear(activeSurfaceKey)}
            testid="ink-clear"
          >
            <IconTrash size={16} />
          </ChipButton>

          <Divider />
          <ChipButton
            label={c.boardOpen ? "Close whiteboard" : "Open whiteboard"}
            active={c.boardOpen}
            onClick={c.toggleBoard}
            testid="ink-board-toggle"
          >
            <BoardGlyph />
          </ChipButton>
        </>
      ) : null}

      {live?.available ? <LiveCluster live={live} /> : null}
    </div>
  );
}

/** Live-session controls — "Go live" when off; a live indicator + copy-link +
 *  stop when hosting. (Viewers never see this — PresentPage shows them a chip.) */
function LiveCluster({ live }: { readonly live: LiveSession }) {
  if (live.role === "host") {
    return (
      <>
        <Divider />
        <span
          data-testid="ink-live-indicator"
          className="inline-flex items-center gap-1.5 h-9 px-2.5 text-[12px]"
          style={{ color: CHIP_TEXT }}
        >
          <span style={{ color: "#34d399" }}>●</span>
          {live.status === "open" ? "Live" : "…"}
        </span>
        <ChipButton
          label="Copy viewer link"
          onClick={() => {
            if (live.shareUrl !== null) void navigator.clipboard?.writeText(live.shareUrl);
          }}
          testid="ink-live-copy"
        >
          <LinkGlyph />
        </ChipButton>
        <ChipButton label="Stop live session" onClick={live.stopLive} testid="ink-live-stop">
          <StopGlyph />
        </ChipButton>
      </>
    );
  }
  return (
    <>
      <Divider />
      <button
        type="button"
        onClick={live.goLive}
        data-testid="ink-go-live"
        className="h-9 px-3 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        style={{ background: CHIP_BG_ACTIVE, color: CHIP_TEXT }}
      >
        <BroadcastGlyph />
        Go live
      </button>
    </>
  );
}

interface ChipButtonProps {
  readonly label: string;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly testid: string;
  readonly children: ReactNode;
}

function ChipButton({ label, active, disabled, onClick, testid, children }: ChipButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      data-testid={testid}
      className="h-9 w-9 inline-flex items-center justify-center rounded-[var(--radius-pill)] border transition-colors duration-[var(--motion-normal)] disabled:opacity-35 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      style={{
        color: CHIP_TEXT,
        background: active ? CHIP_BG_ACTIVE : "transparent",
        borderColor: active ? "transparent" : CHIP_BORDER,
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <span className="w-px h-5 mx-0.5" style={{ background: CHIP_BORDER }} aria-hidden="true" />
  );
}

function HighlighterGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h6l9-9-3-3-9 9v3z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <path d="M14 6l4 4" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <rect x="3" y="21" width="9" height="1.6" rx="0.8" fill="currentColor" />
    </svg>
  );
}

function EraserGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 15l6-6 6 6-3 3H8l-3-3z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <path d="M9 21h10" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

function BoardGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="13" rx="1.6" stroke="currentColor" strokeWidth={1.8} />
      <path d="M9 21l3-4 3 4" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

function BroadcastGlyph() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <path
        d="M7 7a7 7 0 000 10M17 7a7 7 0 010 10M4 4a11 11 0 000 16M20 4a11 11 0 010 16"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </svg>
  );
}

function LinkGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 15l6-6M10 6l1-1a4 4 0 015 5l-1 1M14 18l-1 1a4 4 0 01-5-5l1-1"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StopGlyph() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  );
}
