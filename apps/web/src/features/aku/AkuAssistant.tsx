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
import { useSelection } from "../../document/interactions/selection-context.js";
import type { AkuComposerSeed } from "./AkuComposer.js";
import { AkuInteractionLock } from "./AkuInteractionLock.js";
import { AkuLauncher } from "./AkuLauncher.js";
import { AkuMascot } from "./AkuMascot.js";
import { AkuPanel } from "./AkuPanel.js";
import { useAkuSettings } from "./agent/aku-settings.js";
import { useAkuAgent } from "./agent/use-aku-agent.js";
import { gpuSpriteRenderer } from "./expression/gpu-sprite-renderer.js";
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
  designInfo,
  onFramesAdded,
  onZoomToFrame,
}: {
  readonly editor: Editor;
  readonly document: AgocraftDocument;
  readonly designId: string;
  /** Canvas px size + background from the Design view-model — passed to the
   *  agent per task so it can size text against the real canvas. */
  readonly designInfo: { width: number; height: number; background: string };
  /** WI-065 — fit the camera after the agent adds top-level frame(s). */
  readonly onFramesAdded?: (() => void) | undefined;
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

  const { settings, setSetting } = useAkuSettings();

  const {
    messages,
    status,
    connection,
    serverInfo,
    pendingClarify,
    resolveClarify,
    send,
    stop,
    regenerate,
    editFrom,
    retry,
    clear,
    history,
    hasToken,
    setToken,
    resetToken,
  } = useAkuAgent({
    editor,
    getDocument: () => docRef.current,
    getSelection: () => [...selRef.current],
    getDesignInfo: () => designInfoRef.current,
    designId,
    settings,
    ...(onFramesAdded !== undefined ? { onFramesAdded } : {}),
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
  const roam = useAkuRoam({
    editor,
    streaming: status === "streaming",
    // freeze auto-roam while hidden (panel open) or while the first-run coachmark
    // needs a stable anchor. Tips ride along as the launcher caption (no anchor),
    // so they do NOT pause roaming. A drag always overrides (handled in the hook).
    paused: open || showCoachmark,
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

  // Drag → drag-struggle sprite; travel → move-left/right; else the agent/idle mood
  // (which already resolves to `sleeping` when the roam controller is dozing).
  const spriteMood = roam.dragging
    ? "dragging"
    : roam.moving
      ? roam.dir === "left"
        ? "connecting"
        : "looking"
      : expression.mood;

  // The single Aku: drag to move it (follows pointer), tap to open the panel,
  // auto-roams otherwise. `caption` = work말풍선 / idle tip.
  const launcherProps = {
    style: { left: roam.x, top: roam.y, ...(roam.dragging ? { transition: "none" as const } : {}) },
    onPointerDown: roam.onPointerDown,
    mascot: gpuSpriteRenderer.render({ mood: spriteMood, intensity: expression.intensity }),
    // work caption while streaming; a Zzz hint while dozing; idle tip otherwise.
    caption: expression.caption ?? (roam.sleeping ? "Zzz… (눌러서 깨우기)" : tip),
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {/* WI-105: lock the app to the Aku surface while the agent streams.
          WI-110: when the panel is closed, keep a clear circle around the
          roaming launcher Aku so its live edit stays sharp inside the dim. */}
      <AkuInteractionLock
        locked={status === "streaming"}
        spotlight={status === "streaming" && !open}
      />
      {open ? (
        <AkuPanel
          geometry={geometry}
          onMoveStart={beginMove}
          onResizeStart={beginResize}
          messages={messages}
          status={status}
          connection={connection}
          serverInfo={serverInfo}
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
          onClear={clear}
          undo={history}
          seed={seed}
          hasToken={hasToken}
          onSetToken={setToken}
          onResetToken={resetToken}
        />
      ) : /* WI-107 — closed → the single roaming launcher Aku (no field-agent dup). */
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
          배경 변경, 텍스트·슬라이드 추가 같은 편집을 대화로 처리해 드려요. 드래그로 옮기고 모서리로
          크기를 바꿀 수 있어요.
        </OnboardingCoachmark>
      ) : (
        <AkuLauncher {...launcherProps} />
      )}
    </>,
    document.body,
  );
}
