// 아쿠 (Aku) entry (WI-052 → WI-054) — mounted once inside DesignPage's
// providers. Owns open/closed state; the conversation + agent loop live in
// `useAkuAgent` (reverse-MCP: the small-think server reasons with Claude and
// drives weave's commands back over the link, streaming progress). Renders the
// launcher (collapsed) or panel (expanded), portaled to <body> so it floats
// above canvas chrome.

import type { Document as AgocraftDocument } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { OnboardingCoachmark } from "@weave/design-system";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AgentSurfacePolicy } from "../../document/editor-mode/types.js";
import { useSelection } from "../../document/interactions/selection-context.js";
import type { AkuComposerSeed } from "./AkuComposer.js";
import { AkuInteractionLock } from "./AkuInteractionLock.js";
import { AkuLauncher } from "./AkuLauncher.js";
import { AkuMascot } from "./AkuMascot.js";
import { AkuPanel } from "./AkuPanel.js";
import { useAkuSettings } from "./agent/aku-settings.js";
import { useAkuAgent } from "./agent/use-aku-agent.js";
import { gpuSpriteRenderer } from "./expression/gpu-sprite-renderer.js";
import { resolveAkuMood } from "./expression/mood.js";
import { useAkuExpression } from "./expression/use-aku-expression.js";
import { useAkuFrameCamera } from "./useAkuFrameCamera.js";
import { useAkuGeometry } from "./useAkuGeometry.js";
import { useAkuRoam } from "./useAkuRoam.js";
import { useAkuTips } from "./useAkuTips.js";

const COACHMARK_KEY = "weave.coachmark.aku-intro";
function coachmarkAlreadySeen(): boolean {
  try {
    return window.localStorage.getItem(COACHMARK_KEY) === "shown";
  } catch {
    return false;
  }
}

export function AkuAssistant({
  editor,
  document: agoDocument,
  designId,
  designLoaded,
  designInfo,
  defaultAddContainerId,
  agentSurface,
  onFramesAdded,
  onPageActivate,
  onZoomToFrame,
}: {
  readonly editor: Editor;
  readonly document: AgocraftDocument;
  readonly designId: string;
  /** True once the saved design has finished loading (WI-034 4b) — gates Aku's connect-on-init
   *  so a grace-replayed job edits the real document, not an empty placeholder. */
  readonly designLoaded: boolean;
  /** Canvas px size + background from the Design view-model — passed to the
   *  agent per task so it can size text against the real canvas. */
  readonly designInfo: { width: number; height: number; background: string };
  /** WI-153 P4 / WI-168 — host's default add container (= the ACTIVE PAGE id
   *  on page-bounded formats, undefined on infinite canvas). Feeds the agent
   *  surface's host context (mapInput + promptFragment). */
  readonly defaultAddContainerId?: string | undefined;
  /** WI-168 (DR-115) — the flavor's agent command surface
   *  (EditorModeContext.agent), injected from the composition root. */
  readonly agentSurface: AgentSurfacePolicy;
  /** WI-065 — fit the camera after the agent adds top-level frame(s). */
  readonly onFramesAdded?: (() => void) | undefined;
  /** WI-169 — synchronous page activation when the agent CREATES a page
   *  (weave.page.add / weave.page.duplicate ok). Rail-"+" parity: the host
   *  selects + activates the new page so the agent's next edits land on it. */
  readonly onPageActivate?: ((id: string) => void) | undefined;
  /** WI-125 — center+fit a frame by id (DesignPage's zoom-to-frame). Used to fit
   *  the camera to each NEW slide the agent creates, at its creation moment. */
  readonly onZoomToFrame?: ((frameId: string) => void) | undefined;
}): JSX.Element | null {
  const [open, setOpen] = useState(false);
  // Delay the first-run coachmark until the page has settled — mounting it
  // during the initial load lets canvas focus/pointer events trip Radix's
  // outside-dismiss, which would close (and persist) the hint before it's seen.
  const [hintReady, setHintReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setHintReady(true), 800);
    return () => clearTimeout(t);
  }, []);
  const { selectedIds } = useSelection();

  // Refs so the agent hook always reads the LATEST doc + selection without
  // re-opening the reverse-MCP link.
  const docRef = useRef(agoDocument);
  docRef.current = agoDocument;
  const selRef = useRef(selectedIds);
  selRef.current = selectedIds;
  const designInfoRef = useRef(designInfo);
  designInfoRef.current = designInfo;
  const defaultAddContainerIdRef = useRef(defaultAddContainerId);
  defaultAddContainerIdRef.current = defaultAddContainerId;

  const { settings, setSetting } = useAkuSettings();

  const {
    messages,
    status,
    connection,
    serverInfo,
    queueStatus,
    cancelJob,
    pendingClarify,
    resolveClarify,
    send,
    stop,
    regenerate,
    correctIntent,
    editFrom,
    retry,
    clear,
    history,
    hasToken,
    setToken,
    resetToken,
    agentMode,
    setAgentMode,
  } = useAkuAgent({
    editor,
    getDocument: () => docRef.current,
    getSelection: () => [...selRef.current],
    getDesignInfo: () => designInfoRef.current,
    getDefaultAddContainerId: () => defaultAddContainerIdRef.current,
    agentSurface,
    designId,
    designLoaded,
    settings,
    ...(onFramesAdded !== undefined ? { onFramesAdded } : {}),
    ...(onPageActivate !== undefined ? { onPageActivate } : {}),
  });
  const { geometry, beginMove, beginResize } = useAkuGeometry();

  // editFrom loads a past user turn back into the composer (seed); the nonce
  // forces a reload even when the same text is edited twice.
  const [seed, setSeed] = useState<AkuComposerSeed | null>(null);
  const seedNonce = useRef(0);
  const onEditMessage = (index: number): void => {
    const draft = editFrom(index);
    if (draft === null) return;
    seedNonce.current += 1;
    setSeed({ text: draft.text, images: draft.images, nonce: seedNonce.current });
  };

  // First-run coachmark + recurring tips (closed only, anti-Clippy). They anchor
  // to the launcher, so roaming pauses while either is showing (stable anchor).
  const [coachmarkSeen, setCoachmarkSeen] = useState(coachmarkAlreadySeen);
  const showCoachmark = !coachmarkSeen && hintReady && !open;
  const { tip } = useAkuTips({
    enabled: !open && coachmarkSeen,
  });

  // WI-107 / WI-111 — the single launcher Aku. It sits IDLE at home while the user
  // is editing (real pointer/keyboard activity), WANDERS to random points when the
  // user goes quiet, DOZES (blanket-sleep) after ~1 min idle, and flies to the
  // edited frame while the agent works. `moving` swaps to the move sprite so
  // locomotion is visible; `sleeping` is fed into the expression layer below so the
  // mood table stays the single arbiter. Paused while a coachmark needs a stable anchor.
  const reduceMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const openPanel = useCallback(() => setOpen(true), []);
  // Is Aku in a NON-editing "thinking"-class sub-phase (reasoning / connecting / the
  // terminal turn)? Resolve it off the SAME mood arbiter (single source) with the
  // roam-owned inputs neutralized — during streaming celebrate/looking/sleeping are
  // all false anyway. The roam WANDER (move → 2 loops → move) is for EDITING; while
  // thinking, Aku stays put and just loops the thinking sprite until the state
  // changes — no hop needed since it isn't editing (WI-129).
  const lastMsg = messages[messages.length - 1];
  const thinkingActivity =
    status === "streaming" && lastMsg?.role === "assistant" ? (lastMsg.activity ?? null) : null;
  const thinking =
    resolveAkuMood({
      status,
      connectionState: connection.state,
      activity: thinkingActivity,
      celebrate: false,
      looking: false,
      sleeping: false,
    }) === "thinking";
  const roam = useAkuRoam({
    editor,
    streaming: status === "streaming",
    thinking,
    // freeze auto-roam while hidden (panel open AND idle) or while the first-run
    // coachmark needs a stable anchor. EXCEPTION: while the agent is streaming we
    // keep roaming even with the panel open, so starting an edit visibly summons Aku
    // and it flies to the edited frame (WI-127). Tips ride along as the launcher
    // caption (no anchor), so they do NOT pause roaming. A drag always overrides.
    paused: (open && status !== "streaming") || showCoachmark,
    reduce: reduceMotion,
    boxW: 86,
    boxH: 120,
    home: { x: geometry.x, y: geometry.y },
    onTap: openPanel,
  });

  // WI-126 — keep the camera fitted to the top-level root slide of whatever the
  // agent is editing (subsumes WI-125's new-slide fit). Aku roams within it; de-duped
  // by root id, gated on streaming (manual edits never move the camera).
  useAkuFrameCamera({
    editor,
    streaming: status === "streaming",
    getDocument: () => docRef.current,
    onZoomToFrame,
  });

  // Expression layer (WI-103) — derive the mascot's mood from the run-state the
  // UI already has (status / connection / live `activity` / selection); the
  // producer (useAkuAgent) is untouched. `sleeping` is injected from the roam
  // controller (the only thing watching real edit activity, WI-111). The concrete
  // renderer is injected here (composition root) so the consumer stays renderer-
  // agnostic (DR-070).
  const expression = useAkuExpression({
    status,
    connection,
    messages,
    selectionKey: [...selectedIds].join(","),
    sleeping: roam.sleeping,
  });

  // WI-135 — turn-end FINALE: the moment the agent's work fully settles, Aku plays the
  // 짜잔~ tada at viewport centre, 2× size, for ~2 loops, then returns to idle. The
  // `celebrating` mood (CELEBRATE_MS window) drives it; here we override position/size
  // and pin the sprite so the home-glide locomotion doesn't steal the celebration.
  const celebrating = expression.mood === "celebrating";
  const celebrateStyle =
    celebrating && typeof window !== "undefined"
      ? {
          left: Math.max(4, (window.innerWidth - 86) / 2),
          top: Math.max(4, (window.innerHeight - 120) / 2),
          transform: "scale(2)",
          transformOrigin: "center" as const,
          transition: "left 400ms ease-out, top 400ms ease-out, transform 400ms ease-out",
        }
      : null;

  // Celebrate → tada; drag → struggle; travel → move-left/right; else the agent/idle
  // mood (which already resolves to `sleeping` when the roam controller is dozing).
  const spriteMood = celebrating
    ? "celebrating"
    : roam.dragging
      ? "dragging"
      : roam.moving
        ? roam.dir === "left"
          ? "connecting"
          : "looking"
        : expression.mood;

  // The single Aku: drag to move it (follows pointer), tap to open the panel,
  // auto-roams otherwise. `caption` = work말풍선 / idle tip.
  const launcherProps = {
    style: celebrateStyle ?? {
      left: roam.x,
      top: roam.y,
      ...(roam.dragging ? { transition: "none" as const } : {}),
    },
    onPointerDown: roam.onPointerDown,
    mascot: gpuSpriteRenderer.render({ mood: spriteMood, intensity: expression.intensity }),
    // celebration 말풍선 while finishing; work caption while streaming; Zzz when dozing; else tip.
    caption: expression.caption ?? (roam.sleeping ? "Zzz… (눌러서 깨우기)" : tip),
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {/* WI-105: lock the app to the Aku surface while the agent streams.
          WI-110: keep a clear, BRIGHT circle around the roaming launcher Aku so
          its live edit stays sharp inside the dim. The launcher renders while
          streaming whether or not the panel is open (WI-127), so the spotlight
          tracks it in both cases — it is gated on streaming alone, not on `!open`. */}
      <AkuInteractionLock
        locked={status === "streaming"}
        spotlight={status === "streaming"}
        showStatus={status === "streaming" && !open}
        onStop={stop}
        onOpen={openPanel}
      />
      {/* The roaming launcher Aku. Shown when the panel is CLOSED and — WI-127 —
          ALSO while the agent is streaming even if the panel is open, so starting
          an edit visibly summons Aku (it flies to the edited frame). WI-137: ALSO
          kept through the turn-end celebration window, so the finale plays before Aku
          disappears (otherwise idle+panel-open unmounts it mid-celebration). Rendered
          BEFORE the panel so the panel stays on top where they overlap. The first-run
          coachmark anchors only when closed — showCoachmark already requires !open. */}
      {!open || status === "streaming" || celebrating ? (
        showCoachmark ? (
          // First-run nudge to drive discovery — one-shot, anchored to the launcher
          // (persisted under weave.coachmark.aku-intro; silent on later visits).
          <OnboardingCoachmark
            persistKey="aku-intro"
            side="bottom"
            align="start"
            icon={<AkuMascot variant="mark" className="w-5 h-5" />}
            headline="아쿠에게 맡겨보세요"
            dismissLabel="알겠어요"
            onDismissed={() => setCoachmarkSeen(true)}
            anchor={<AkuLauncher {...launcherProps} />}
          >
            배경 변경, 텍스트·슬라이드 추가 같은 편집을 대화로 처리해 드려요. 드래그로 옮기고
            모서리로 크기를 바꿀 수 있어요.
          </OnboardingCoachmark>
        ) : (
          <AkuLauncher {...launcherProps} />
        )
      ) : null}
      {open ? (
        <AkuPanel
          geometry={geometry}
          onMoveStart={beginMove}
          onResizeStart={beginResize}
          messages={messages}
          status={status}
          connection={connection}
          serverInfo={serverInfo}
          queueStatus={queueStatus}
          onCancelJob={cancelJob}
          pendingClarify={pendingClarify}
          onResolveClarify={resolveClarify}
          onSend={send}
          settings={settings}
          onSetSetting={setSetting}
          onStop={stop}
          onClose={() => setOpen(false)}
          onRegenerate={regenerate}
          onRetry={retry}
          onEditMessage={onEditMessage}
          onCorrectIntent={correctIntent}
          onClear={clear}
          undo={history}
          seed={seed}
          hasToken={hasToken}
          onSetToken={setToken}
          onResetToken={resetToken}
          agentMode={agentMode}
          onSetAgentMode={setAgentMode}
        />
      ) : null}
    </>,
    document.body,
  );
}
