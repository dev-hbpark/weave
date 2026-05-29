// 아쿠 (Aku) entry (WI-052) — mounted once inside DesignPage's providers.
// Owns open/closed state and wires the swappable seams: a transport (mock now,
// Claude later) + a design-aware toolset (reads latest doc/selection via refs,
// edits via editor.exec). Renders the launcher (collapsed) or panel (expanded),
// portaled to <body> so it floats above canvas chrome.

import type { Document as AgocraftDocument } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { IconSparkle, OnboardingCoachmark } from "@weave/design-system";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useSelection } from "../../document/interactions/selection-context.js";
import { AkuLauncher } from "./AkuLauncher.js";
import { AkuPanel } from "./AkuPanel.js";
import { createAkuTools } from "./tools/aku-tools.js";
import { createMockAkuTransport } from "./transport/mock-transport.js";
import { useAkuConversation } from "./useAkuConversation.js";
import { useAkuGeometry } from "./useAkuGeometry.js";

export function AkuAssistant({
  editor,
  document: agoDocument,
}: {
  readonly editor: Editor;
  readonly document: AgocraftDocument;
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

  // Refs so the memoized toolset always reads the LATEST doc + selection
  // without rebuilding the executors map on every edit.
  const docRef = useRef(agoDocument);
  docRef.current = agoDocument;
  const selRef = useRef(selectedIds);
  selRef.current = selectedIds;

  const toolset = useMemo(
    () =>
      createAkuTools({
        editor,
        getDocument: () => docRef.current,
        getSelection: () => [...selRef.current],
      }),
    [editor],
  );
  const transport = useMemo(() => createMockAkuTransport(), []);
  const { messages, status, send, stop } = useAkuConversation({ transport, toolset });
  const { geometry, beginMove, beginResize } = useAkuGeometry();

  // The collapsed launcher sits at the persisted position and is itself
  // draggable (tap-vs-drag): a tap opens the panel, a drag relocates it.
  const launcherProps = {
    style: { left: geometry.x, top: geometry.y },
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) =>
      beginMove(e, { onTap: () => setOpen(true) }),
  };

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
      />
    ) : hintReady ? (
      // First-run nudge to drive discovery — one-shot, anchored to the launcher
      // (persisted under weave.coachmark.aku-intro; silent on later visits).
      <OnboardingCoachmark
        persistKey="aku-intro"
        side="bottom"
        align="start"
        icon={<IconSparkle size={18} />}
        headline="아쿠에게 맡겨보세요"
        dismissLabel="알겠어요"
        anchor={<AkuLauncher {...launcherProps} />}
      >
        배경 변경, 텍스트·슬라이드 추가 같은 편집을 대화로 처리해 드려요. 드래그로 옮기고 모서리로
        크기를 바꿀 수 있어요.
      </OnboardingCoachmark>
    ) : (
      <AkuLauncher {...launcherProps} />
    ),
    document.body,
  );
}
