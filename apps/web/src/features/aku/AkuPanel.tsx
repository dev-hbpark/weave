// Aku panel shell (WI-052 → WI-053) — reuses the design-system `Panel`
// (floating), but host-positioned + resizable: the wrapper is absolutely placed
// from the persisted geometry, the header title cluster is the drag handle, and
// a bottom-right grabber resizes. Header = 아쿠 title (drag) + 새 대화 + close;
// Body = transcript; Footer = composer.

import type { ClarifyRequest, QueueStatus, ServerInfo } from "@agocraft/agent-client";
import { Banner, IconButton, IconClose, Panel } from "@weave/design-system";
import { type PointerEvent as ReactPointerEvent, useLayoutEffect, useRef } from "react";
import { AkuComposer, type AkuComposerSeed } from "./AkuComposer.js";
import { AkuMascot } from "./AkuMascot.js";
import { AkuModeBar } from "./AkuModeBar.js";
import { AkuQueueChip } from "./AkuQueueChip.js";
import { AkuServerInfoChip } from "./AkuServerInfoChip.js";
import { AkuSettingsMenu } from "./AkuSettingsMenu.js";
import { AkuThemeSuggestion } from "./AkuThemeSuggestion.js";
import { AkuTokenSetup } from "./AkuTokenSetup.js";
import type { AkuAgentMode } from "./agent/agent-mode.js";
import type { AkuSettings, SetAkuSetting } from "./agent/aku-settings.js";
import type { IntentPlan, Operation } from "./agent/intent/types.js";
import { ClarifyPicker } from "./ClarifyPicker.js";
import { MessageList } from "./MessageList.js";
import type {
  AkuConnection,
  AkuHistoryController,
  AkuImage,
  AkuMessage,
  AkuStatus,
} from "./types.js";
import type { AkuGeometry } from "./useAkuGeometry.js";

export function AkuPanel({
  geometry,
  onMoveStart,
  onResizeStart,
  messages,
  status,
  connection,
  serverInfo,
  queueStatus,
  onCancelJob,
  pendingClarify,
  onResolveClarify,
  onSend,
  settings,
  onSetSetting,
  onStop,
  onClose,
  onRegenerate,
  onRetry,
  onEditMessage,
  onCorrectIntent,
  onClear,
  undo,
  seed,
  hasToken,
  onSetToken,
  onResetToken,
  agentMode,
  onSetAgentMode,
}: {
  readonly geometry: AkuGeometry;
  readonly onMoveStart: (e: ReactPointerEvent) => void;
  readonly onResizeStart: (e: ReactPointerEvent) => void;
  readonly messages: ReadonlyArray<AkuMessage>;
  readonly status: AkuStatus;
  /** Reverse-MCP connection lifecycle — drives the connecting/reconnecting banner. */
  readonly connection: AkuConnection;
  /** The agent-server's announced active config (mode + model/speed knobs), or null
   *  until it arrives on connect. Rendered as a header chip with a hover tooltip. */
  readonly serverInfo: ServerInfo | null;
  /** The agent-server's live job-queue view (WI-034), or null until it arrives. Rendered
   *  as a header chip (running/queued + this client's position) with a cancel affordance. */
  readonly queueStatus: QueueStatus | null;
  /** Cancel a server-side job by task id (the queue chip's cancel button). */
  readonly onCancelJob: (taskId: string) => void;
  /** A pending pre-generation "which media types?" question, or null. */
  readonly pendingClarify: { readonly req: ClarifyRequest } | null;
  /** Answer the pending clarify question with the selected item-type names. */
  readonly onResolveClarify: (types: readonly string[]) => void;
  readonly onSend: (
    text: string,
    images: ReadonlyArray<AkuImage>,
    opts?: {
      styleId?: string | null;
      styleRefImages?: ReadonlyArray<AkuImage>;
      intent?: IntentPlan;
      intentOp?: Operation;
    },
  ) => void;
  /** Behavior flags (gear menu) + a single-setting setter. */
  readonly settings: AkuSettings;
  readonly onSetSetting: SetAkuSetting;
  readonly onStop: () => void;
  readonly onClose: () => void;
  readonly onRegenerate: () => void;
  readonly onRetry: () => void;
  readonly onEditMessage: (index: number) => void;
  /** Re-run the latest turn with a corrected editing intent (chip edit, WI-148). */
  readonly onCorrectIntent: (plan: IntentPlan) => void;
  readonly onClear: () => void;
  readonly undo: AkuHistoryController | undefined;
  readonly seed: AkuComposerSeed | null;
  /** When false, the body shows the token-setup gate and the composer is hidden. */
  readonly hasToken: boolean;
  readonly onSetToken: (token: string) => void;
  /** Forget the saved token → back to the setup gate (escape a wrong token). */
  readonly onResetToken: () => void;
  /** Execution-mode request (WI-175) — gear-menu segmented control. */
  readonly agentMode: AkuAgentMode;
  readonly onSetAgentMode: (mode: AkuAgentMode) => void;
}): JSX.Element {
  // Auto-scroll the transcript to the bottom whenever a new message arrives or
  // the streaming reply grows, so the latest content is always in view. Tracking
  // the last message's text length also keeps it pinned to the bottom while the
  // assistant streams; `status` covers the streaming→final markdown swap (which
  // can change height without changing message count/text). useLayoutEffect runs
  // before paint so there is no visible jump.
  const bodyRef = useRef<HTMLDivElement>(null);
  const lastText = messages.at(-1)?.text ?? "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll signal is the message count + streamed length + status, not bodyRef.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el === null) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, lastText.length, status]);
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
          {/* Server config chip — outside the drag handle so hover/focus isn't
              captured by the move gesture. Renders nothing until serverInfo arrives. */}
          <AkuServerInfoChip serverInfo={serverInfo} />
          {/* Live queue position + cancel (WI-034). Renders nothing while idle. */}
          <AkuQueueChip queueStatus={queueStatus} onCancel={onCancelJob} />
          <AkuSettingsMenu
            settings={settings}
            onSetSetting={onSetSetting}
            onClear={onClear}
            canClear={messages.length > 0}
            onResetToken={onResetToken}
            hasToken={hasToken}
          />
          {/* While streaming, closing does NOT end the run — it minimizes to the
              floating "편집 중…" pill (which carries the stop button). Label it as
              minimize so the affordance matches the behavior. */}
          <IconButton
            aria-label={status === "streaming" ? "아쿠 최소화" : "아쿠 닫기"}
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            <IconClose size={16} />
          </IconButton>
        </Panel.Header>
        {/* Execution-mode toggles (HANDOFF-030) — provider × transport, always
            visible under the header so the operator can switch + verify without
            opening the gear menu. Only once connected (a token exists). */}
        {hasToken ? <AkuModeBar agentMode={agentMode} onSetAgentMode={onSetAgentMode} /> : null}
        <Panel.Body ref={bodyRef} data-aku-body>
          {hasToken && connection.banner !== null ? (
            <div className="px-3 pt-2">
              <Banner
                tone="info"
                headline={connection.banner}
                dismissible={false}
                data-testid="aku-connection-banner"
                {...(connection.state === "error"
                  ? { action: { label: "다시 연결", onAction: onRetry } }
                  : {})}
              />
            </div>
          ) : null}
          {hasToken ? (
            <MessageList
              messages={messages}
              streaming={status === "streaming"}
              onRegenerate={onRegenerate}
              onRetry={onRetry}
              onEdit={onEditMessage}
              onCorrectIntent={onCorrectIntent}
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
            <AkuThemeSuggestion messages={messages} enabled={settings.themeAdvice} />
            {pendingClarify !== null ? (
              <div className="pb-2">
                <ClarifyPicker request={pendingClarify.req} onSubmit={onResolveClarify} />
              </div>
            ) : null}
            <AkuComposer
              onSend={onSend}
              settings={settings}
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
