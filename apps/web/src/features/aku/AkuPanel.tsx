// Aku panel shell (WI-052) — reuses the design-system `Panel` (floating), but
// host-positioned + resizable: the wrapper is absolutely placed from the
// persisted geometry, the header title cluster is the drag handle, and a
// bottom-right grabber resizes. Header = 아쿠 title (drag) + close; Body =
// transcript; Footer = composer.

import { IconButton, IconClose, IconSparkle, Panel } from "@weave/design-system";
import type { PointerEvent as ReactPointerEvent } from "react";
import { AkuComposer } from "./AkuComposer.js";
import { MessageList } from "./MessageList.js";
import type { AkuImage, AkuMessage } from "./transport/types.js";
import type { AkuStatus } from "./useAkuConversation.js";
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
}: {
  readonly geometry: AkuGeometry;
  readonly onMoveStart: (e: ReactPointerEvent) => void;
  readonly onResizeStart: (e: ReactPointerEvent) => void;
  readonly messages: ReadonlyArray<AkuMessage>;
  readonly status: AkuStatus;
  readonly onSend: (text: string, images: ReadonlyArray<AkuImage>) => void;
  readonly onStop: () => void;
  readonly onClose: () => void;
}): JSX.Element {
  return (
    <div
      className="fixed z-[48]"
      style={{ left: geometry.x, top: geometry.y, width: geometry.w, height: geometry.h }}
      data-aku-panel
    >
      <Panel position="floating" width="md" className="w-full h-full" aria-label="아쿠 대화">
        <Panel.Header className="flex items-center justify-between gap-2">
          {/* drag handle — the title cluster (close button stays clickable) */}
          <div
            className="flex flex-1 items-center gap-2 cursor-move touch-none select-none"
            onPointerDown={onMoveStart}
            data-aku-drag-handle
          >
            <span className="text-[color:var(--accent)]" aria-hidden="true">
              <IconSparkle size={18} />
            </span>
            <Panel.Title>아쿠</Panel.Title>
          </div>
          <IconButton aria-label="아쿠 닫기" variant="ghost" size="sm" onClick={onClose}>
            <IconClose size={16} />
          </IconButton>
        </Panel.Header>
        <Panel.Body>
          <MessageList messages={messages} streaming={status === "streaming"} />
        </Panel.Body>
        <Panel.Footer>
          <AkuComposer onSend={onSend} onStop={onStop} streaming={status === "streaming"} />
        </Panel.Footer>
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
