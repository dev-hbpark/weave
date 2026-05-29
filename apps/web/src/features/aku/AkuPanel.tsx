// Aku panel shell (WI-052 → WI-053) — reuses the design-system `Panel`
// (floating), but host-positioned + resizable: the wrapper is absolutely placed
// from the persisted geometry, the header title cluster is the drag handle, and
// a bottom-right grabber resizes. Header = 아쿠 title (drag) + 새 대화 + close;
// Body = transcript; Footer = composer.

import { IconButton, IconClose, IconPlus, Panel } from "@weave/design-system";
import type { PointerEvent as ReactPointerEvent } from "react";
import { AkuComposer, type AkuComposerSeed } from "./AkuComposer.js";
import { AkuMascot } from "./AkuMascot.js";
import { AkuTokenSetup } from "./AkuTokenSetup.js";
import { MessageList } from "./MessageList.js";
import type { AkuHistoryController, AkuImage, AkuMessage, AkuStatus } from "./types.js";
import type { AkuGeometry } from "./useAkuGeometry.js";

export function AkuPanel({
  geometry,
  onMoveStart,
  onResizeStart,
  messages,
  status,
  onSend,
  onStop,
  onClose,
  onRegenerate,
  onRetry,
  onEditMessage,
  onClear,
  undo,
  seed,
  hasToken,
  onSetToken,
  onResetToken,
}: {
  readonly geometry: AkuGeometry;
  readonly onMoveStart: (e: ReactPointerEvent) => void;
  readonly onResizeStart: (e: ReactPointerEvent) => void;
  readonly messages: ReadonlyArray<AkuMessage>;
  readonly status: AkuStatus;
  readonly onSend: (text: string, images: ReadonlyArray<AkuImage>) => void;
  readonly onStop: () => void;
  readonly onClose: () => void;
  readonly onRegenerate: () => void;
  readonly onRetry: () => void;
  readonly onEditMessage: (index: number) => void;
  readonly onClear: () => void;
  readonly undo: AkuHistoryController | undefined;
  readonly seed: AkuComposerSeed | null;
  /** When false, the body shows the token-setup gate and the composer is hidden. */
  readonly hasToken: boolean;
  readonly onSetToken: (token: string) => void;
  /** Forget the saved token → back to the setup gate (escape a wrong token). */
  readonly onResetToken: () => void;
}): JSX.Element {
  return (
    <div
      className="fixed z-[48]"
      style={{ left: geometry.x, top: geometry.y, width: geometry.w, height: geometry.h }}
      data-aku-panel
    >
      <Panel position="floating" width="md" className="w-full h-full" aria-label="아쿠 대화">
        <Panel.Header className="flex items-center justify-between gap-2">
          {/* drag handle — the title cluster (action buttons stay clickable) */}
          <div
            className="flex flex-1 items-center gap-2 cursor-move touch-none select-none"
            onPointerDown={onMoveStart}
            data-aku-drag-handle
          >
            <AkuMascot variant="mark" className="w-5 h-5 shrink-0" />
            <Panel.Title>아쿠</Panel.Title>
          </div>
          {hasToken ? (
            <button
              type="button"
              onClick={onResetToken}
              data-testid="aku-token-reset"
              className="text-[11px] text-[color:var(--text-soft)] hover:text-[color:var(--text-strong)] px-1.5 py-1 rounded-[var(--radius-sm)] hover:bg-[color:var(--surface-2)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              토큰 재설정
            </button>
          ) : null}
          <IconButton
            aria-label="새 대화"
            variant="ghost"
            size="sm"
            onClick={onClear}
            data-testid="aku-new-conversation"
            disabled={messages.length === 0}
          >
            <IconPlus size={16} />
          </IconButton>
          <IconButton aria-label="아쿠 닫기" variant="ghost" size="sm" onClick={onClose}>
            <IconClose size={16} />
          </IconButton>
        </Panel.Header>
        <Panel.Body>
          {hasToken ? (
            <MessageList
              messages={messages}
              streaming={status === "streaming"}
              onRegenerate={onRegenerate}
              onRetry={onRetry}
              onEdit={onEditMessage}
              undo={undo}
            />
          ) : (
            // No agent-server token yet → prompt for one; saving it initializes
            // the connection so the next message connects normally.
            <AkuTokenSetup onSave={onSetToken} />
          )}
        </Panel.Body>
        {hasToken ? (
          <Panel.Footer>
            <AkuComposer
              onSend={onSend}
              onStop={onStop}
              streaming={status === "streaming"}
              seed={seed}
            />
          </Panel.Footer>
        ) : null}
      </Panel>
      {/* resize grabber — bottom-right corner */}
      <button
        type="button"
        aria-label="아쿠 패널 크기 조절"
        data-aku-resize
        onPointerDown={onResizeStart}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize touch-none rounded-br-[var(--radius-md)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        style={{
          backgroundImage:
            "linear-gradient(135deg, transparent 0 50%, var(--text-soft) 50% 60%, transparent 60% 72%, var(--text-soft) 72% 82%, transparent 82%)",
        }}
      />
    </div>
  );
}
