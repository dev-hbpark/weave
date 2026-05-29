// 아쿠 (Aku) entry (WI-052 → WI-054) — mounted once inside DesignPage's
// providers. Owns open/closed state; the conversation + agent loop live in
// `useAkuAgent` (reverse-MCP: the small-think server reasons with Claude and
// drives weave's commands back over the link, streaming progress). Renders the
// launcher (collapsed) or panel (expanded), portaled to <body> so it floats
// above canvas chrome.

import type { Document as AgocraftDocument } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { OnboardingCoachmark } from "@weave/design-system";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSelection } from "../../document/interactions/selection-context.js";
import type { AkuComposerSeed } from "./AkuComposer.js";
import { AkuLauncher } from "./AkuLauncher.js";
import { AkuMascot } from "./AkuMascot.js";
import { AkuPanel } from "./AkuPanel.js";
import { AkuTipBubble } from "./AkuTipBubble.js";
import { useAkuAgent } from "./agent/use-aku-agent.js";
import { useAkuGeometry } from "./useAkuGeometry.js";
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
}: {
  readonly editor: Editor;
  readonly document: AgocraftDocument;
  readonly designId: string;
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

  const { messages, status, send, stop, regenerate, editFrom, retry, clear, history } = useAkuAgent(
    {
      editor,
      getDocument: () => docRef.current,
      getSelection: () => [...selRef.current],
      designId,
    },
  );
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

  // The collapsed launcher sits at the persisted position and is itself
  // draggable (tap-vs-drag): a tap opens the panel, a drag relocates it.
  const launcherProps = {
    style: { left: geometry.x, top: geometry.y },
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) =>
      beginMove(e, { onTap: () => setOpen(true) }),
  };

  // Floating-mascot tips (요정처럼 둥둥 + 말풍선) — only after the first-run
  // coachmark is done, and only while the panel is closed (anti-Clippy).
  const [coachmarkSeen, setCoachmarkSeen] = useState(coachmarkAlreadySeen);
  const showCoachmark = !coachmarkSeen && hintReady;
  const { tip, dismiss, disableForever } = useAkuTips({
    enabled: !open && coachmarkSeen,
  });

  if (typeof document === "undefined") return null;
  return createPortal(
    open ? (
      <AkuPanel
        geometry={geometry}
        onMoveStart={beginMove}
        onResizeStart={beginResize}
        messages={messages}
        status={status}
        onSend={send}
        onStop={stop}
        onClose={() => setOpen(false)}
        onRegenerate={regenerate}
        onRetry={retry}
        onEditMessage={onEditMessage}
        onClear={clear}
        undo={history}
        seed={seed}
      />
    ) : showCoachmark ? (
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
    ) : tip !== null ? (
      // Recurring floating-mascot tip (요정처럼 말풍선) — anchored to the launcher.
      <AkuTipBubble
        tip={tip}
        onDismiss={dismiss}
        onDisableForever={disableForever}
        anchor={<AkuLauncher {...launcherProps} />}
      />
    ) : (
      <AkuLauncher {...launcherProps} />
    ),
    document.body,
  );
}
