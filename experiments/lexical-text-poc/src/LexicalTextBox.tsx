import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { $patchStyleText } from "@lexical/selection";
import { $getSelection, $isRangeSelection } from "lexical";
import { useCallback, useMemo } from "react";
import type * as Y from "yjs";

/**
 * Minimal Lexical editor wrapped for the PoC.
 *
 * 핵심 검증 포인트 (README.md §실행 + 수동 검증 plan):
 * - LexicalComposer + initialConfig 의 useMemo (StrictMode 안전성, DR-015 §Why ¶4)
 * - CollaborationPlugin + Y.Doc bridge (FR-002 §4 trade-off, HANDOFF-010 §C)
 * - $patchStyleText 로 applyRange (FR-002 §4.4)
 *
 * 한 LexicalComposer 는 한 Y.Doc 의 한 root XmlText 에 한정 — HANDOFF-010 §2.F 의 F2.
 */

interface LexicalTextBoxProps {
  readonly label: string;
  readonly yDoc: Y.Doc;
  readonly anchorId: string;
}

export function LexicalTextBox({ label, yDoc, anchorId }: LexicalTextBoxProps) {
  // useMemo — initialConfig 가 매 render 마다 다른 객체면 LexicalComposer 가
  // editor 인스턴스를 재생성 → StrictMode 더블 마운트와 결합 시 dispose 회귀 위험.
  // [[feedback-react-strictmode-singleton-dispose]] 회피 핵심.
  const initialConfig = useMemo(
    () => ({
      namespace: `text-poc:${anchorId}`,
      onError(error: Error) {
        console.error("[Lexical error]", error);
        throw error;
      },
      // Collab 모드에서는 root 가 empty 로 초기화되어야 함 (Y.Doc 이 source of truth)
      editorState: null,
      theme: {
        text: {
          bold: "lex-bold",
          italic: "lex-italic",
          underline: "lex-underline",
        },
      },
    }),
    [anchorId],
  );

  // providerFactory — CollaborationPlugin 이 호출. Y.Doc 을 PoC 에서는 외부 inject.
  // Fake provider — 실제 wire (HTTP / WebSocket / SSE) 는 @agocraft/sync 책임.
  // 본 PoC 는 in-memory bridge (yjs-bridge.ts) 가 docA ↔ docB 를 직접 sync.
  type ProviderShape = Parameters<typeof CollaborationPlugin>[0]["providerFactory"] extends (
    ...args: never[]
  ) => infer R
    ? R
    : never;

  const providerFactory = useCallback(
    (id: string, yjsDocMap: Map<string, Y.Doc>): ProviderShape => {
      yjsDocMap.set(id, yDoc);
      return {
        awareness: {
          clientID: Math.floor(Math.random() * 1_000_000),
          getLocalState: () => null,
          setLocalState: () => undefined,
          setLocalStateField: () => undefined,
          getStates: () => new Map(),
          on: () => undefined,
          off: () => undefined,
        },
        connect: () => undefined,
        disconnect: () => undefined,
        on: () => undefined,
        off: () => undefined,
      } as unknown as ProviderShape;
    },
    [yDoc],
  );

  return (
    <div className="editor-shell">
      <div className="editor-label">{label}</div>
      <LexicalComposer initialConfig={initialConfig}>
        <div style={{ position: "relative" }}>
          <RichTextPlugin
            contentEditable={<ContentEditable className="editor" />}
            placeholder={<div className="editor-placeholder">여기에 입력...</div>}
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <CollaborationPlugin id={anchorId} providerFactory={providerFactory} shouldBootstrap />
        <ApplyRangeToolbar />
      </LexicalComposer>
    </div>
  );
}

/**
 * applyRange 의 PoC — 선택 영역에 bold / italic / underline / color 적용.
 * 실제 weave 의 `weave.text.applyRange` 커맨드 (FR-002 §4.4) 가 같은 API 위로 wire.
 */
function ApplyRangeToolbar() {
  const [editor] = useLexicalComposerContext();

  const applyStyle = useCallback(
    (style: Record<string, string>) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $patchStyleText(selection, style);
        }
      });
    },
    [editor],
  );

  const applyFormat = useCallback(
    (format: "bold" | "italic" | "underline") => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.formatText(format);
        }
      });
    },
    [editor],
  );

  return (
    <div className="toolbar">
      <button type="button" onClick={() => applyFormat("bold")}>
        <strong>B</strong>
      </button>
      <button type="button" onClick={() => applyFormat("italic")}>
        <em>I</em>
      </button>
      <button type="button" onClick={() => applyFormat("underline")}>
        <u>U</u>
      </button>
      <button type="button" onClick={() => applyStyle({ color: "#dc2626" })}>
        Red
      </button>
      <button type="button" onClick={() => applyStyle({ color: "#2563eb" })}>
        Blue
      </button>
      <button type="button" onClick={() => applyStyle({ color: "" })}>
        Clear color
      </button>
    </div>
  );
}
