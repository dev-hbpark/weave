// 아쿠 (Aku) conversation hook (WI-054) — reverse-MCP edition.
//
// Replaces the WI-052/053 client-side agentic loop (`useAkuConversation` +
// `AkuTransport` + `AkuToolset`). The agent loop now lives on the small-think
// server: this hook opens ONE reverse-MCP link via `connectAgocraftAgent`
// (which hosts every `weave.*` command as an MCP tool), then `submit`s each
// user turn. The server reasons with Claude, calls the weave commands back over
// the link — so edits flow through `editor.exec` → History exactly like a user
// action — and STREAMS progress (`turn` / `tool` / `response`) which we render
// as live edit-chips before the final reply lands.
//
// Coverage is automatic: `connectAgocraftAgent` enumerates the whole command
// registry, so every weave editing command is an agent tool. `WEAVE_COMMAND_SCHEMAS`
// supplies the argument contracts (DR-009).

import { connectAgocraftAgent, type ToolClientHandle } from "@agocraft/agent-client";
import type { Document as AgocraftDocument, Schema } from "@agocraft/core";
import { CommandRegistryToken, type Editor } from "@agocraft/editor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearConversation,
  loadConversation,
  persistConversation,
} from "../conversation-storage.js";
import type {
  AkuAssistantMessage,
  AkuDraft,
  AkuHistoryController,
  AkuImage,
  AkuMessage,
  AkuStatus,
} from "../types.js";
import { WEAVE_COMMAND_LABELS, WEAVE_COMMAND_SCHEMAS } from "./weave-command-schemas.js";

export interface UseAkuAgent {
  readonly messages: ReadonlyArray<AkuMessage>;
  readonly status: AkuStatus;
  send(text: string, images?: ReadonlyArray<AkuImage>): void;
  stop(): void;
  /** Re-run the most recent user turn (drops its response first). */
  regenerate(): void;
  /** Roll the transcript back to before the user message at `index` and return
   *  its content so the composer can reload it for editing. */
  editFrom(index: number): AkuDraft | null;
  /** Re-run the last user turn after an error. */
  retry(): void;
  /** Wipe the transcript (and its persisted copy). */
  clear(): void;
  /** Undo controller for turn-level "이 변경 되돌리기" (live session only). */
  readonly history: AkuHistoryController;
}

/** Dev-default wiring. Production must inject a real URL + token (the deployed
 *  weave is an anonymous shared workspace — see apps/web/CLAUDE.md). */
const DEV_URL = "ws://localhost:8787";
const DEV_TOKEN = "dev-token";

function envStr(key: string): string | undefined {
  const v = (import.meta.env as Record<string, unknown>)[key];
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** Friendly chip label for a streamed tool-call (command name → Korean verb). */
function chipLabel(toolName: string): string {
  // The bridge also exposes design.snapshot / design.capabilities context tools;
  // those aren't edits, but if one streams through we still label it readably.
  return WEAVE_COMMAND_LABELS[toolName] ?? toolName;
}

export function useAkuAgent(deps: {
  readonly editor: Editor;
  readonly getDocument: () => AgocraftDocument;
  readonly getSelection: () => ReadonlyArray<string>;
  readonly designId: string;
  readonly url?: string;
  readonly token?: string;
}): UseAkuAgent {
  const { editor, getDocument, getSelection, designId } = deps;
  const url = deps.url ?? envStr("VITE_AKU_AGENT_URL") ?? DEV_URL;
  const token = deps.token ?? envStr("VITE_AKU_AGENT_TOKEN") ?? DEV_TOKEN;

  const [messages, setMessages] = useState<ReadonlyArray<AkuMessage>>(() =>
    loadConversation(designId),
  );
  const [status, setStatus] = useState<AkuStatus>("idle");
  const messagesRef = useRef<ReadonlyArray<AkuMessage>>(messages);

  // Latest-value refs so the stable callbacks never go stale.
  const getDocumentRef = useRef(getDocument);
  getDocumentRef.current = getDocument;
  const getSelectionRef = useRef(getSelection);
  getSelectionRef.current = getSelection;

  // One reverse-MCP link per mounted hook, opened lazily on first send.
  const handleRef = useRef<ToolClientHandle | null>(null);
  const connectingRef = useRef<Promise<ToolClientHandle> | null>(null);
  // Supersession token: stop / clear / a new send invalidate an in-flight submit
  // (the server keeps running, but we ignore its late resolution).
  const genRef = useRef(0);

  const commands = useMemo(() => editor.container.resolve(CommandRegistryToken), [editor]);
  const history = useMemo<AkuHistoryController>(
    () => ({
      depth: () => editor.history.undoSize(),
      undo: (times) => {
        for (let i = 0; i < times && editor.history.canUndo(); i++) editor.history.undo();
      },
    }),
    [editor],
  );

  const commit = useCallback((next: ReadonlyArray<AkuMessage>): void => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  // Persist on every change (best-effort, designId-keyed).
  useEffect(() => {
    persistConversation(designId, messages);
  }, [designId, messages]);

  // Close the link on unmount.
  useEffect(() => {
    return () => {
      genRef.current += 1;
      void handleRef.current?.close();
      handleRef.current = null;
      connectingRef.current = null;
    };
  }, []);

  const getHandle = useCallback((): Promise<ToolClientHandle> => {
    if (handleRef.current !== null) return Promise.resolve(handleRef.current);
    if (connectingRef.current === null) {
      const schema = getDocumentRef.current().schema as Schema | undefined;
      connectingRef.current = connectAgocraftAgent({
        editor,
        commands,
        getDocument: () => getDocumentRef.current(),
        schemas: WEAVE_COMMAND_SCHEMAS,
        userId: `weave:${designId === "" ? "default" : designId}`,
        url,
        token,
        ...(schema !== undefined ? { schema } : {}),
      }).then((h) => {
        handleRef.current = h;
        return h;
      });
    }
    return connectingRef.current;
  }, [editor, commands, designId, url, token]);

  /** Replace the trailing assistant message (the in-flight turn's bubble). */
  const patchLastAssistant = useCallback(
    (patch: (prev: AkuAssistantMessage) => AkuAssistantMessage): void => {
      const cur = messagesRef.current;
      const last = cur[cur.length - 1];
      if (last === undefined || last.role !== "assistant") return;
      commit([...cur.slice(0, -1), patch(last)]);
    },
    [commit],
  );

  const runTurn = useCallback(
    async (text: string, images: ReadonlyArray<AkuImage>): Promise<void> => {
      genRef.current += 1;
      const gen = genRef.current;
      const now = Date.now();
      const userMsg: AkuMessage = {
        role: "user",
        text,
        ...(images.length > 0 ? { images } : {}),
        at: now,
      };
      const assistantMsg: AkuAssistantMessage = { role: "assistant", text: "", edits: [], at: now };
      commit([...messagesRef.current, userMsg, assistantMsg]);
      setStatus("streaming");

      const depthBefore = editor.history.undoSize();

      // Selection is view-state (not in the server's document snapshot); surface
      // it as context so "이걸 …" style prompts can target the current selection.
      const selected = getSelectionRef.current();
      const task =
        selected.length > 0
          ? `[컨텍스트] 현재 선택된 아이템 id: ${selected.join(", ")}\n\n${text}`
          : text;

      try {
        const handle = await getHandle();
        if (genRef.current !== gen) return;
        // `event` is inferred as the client's TaskEvent union (turn / response /
        // tool); we render each `tool` event as a live edit-chip.
        const res = await handle.submit(task, {
          onEvent: (event) => {
            if (genRef.current !== gen) return;
            if (event.type !== "tool") return;
            patchLastAssistant((prev) => ({
              ...prev,
              edits: [
                ...(prev.edits ?? []),
                { tool: event.name, summary: chipLabel(event.name), ok: event.ok },
              ],
            }));
          },
        });
        if (genRef.current !== gen) return;
        const depthAfter = editor.history.undoSize();
        const succeeded = res.ok && res.error === undefined;
        patchLastAssistant((prev) => ({
          ...prev,
          text: succeeded ? (res.finalText ?? "") : (res.error ?? "요청을 처리하지 못했어요."),
          ...(succeeded ? {} : { error: true }),
          historyDepthAfter: depthAfter,
          undoEntryCount: Math.max(0, depthAfter - depthBefore),
        }));
      } catch (err) {
        if (genRef.current !== gen) return;
        const detail = err instanceof Error ? err.message : String(err);
        patchLastAssistant((prev) => ({
          ...prev,
          text: `에이전트 서버에 연결하지 못했어요. (${detail})`,
          error: true,
        }));
      } finally {
        if (genRef.current === gen) setStatus("idle");
      }
    },
    [commit, editor, getHandle, patchLastAssistant],
  );

  const send = useCallback(
    (text: string, images: ReadonlyArray<AkuImage> = []): void => {
      const trimmed = text.trim();
      if (trimmed === "" && images.length === 0) return;
      if (status === "streaming") return;
      void runTurn(trimmed, images);
    },
    [runTurn, status],
  );

  const stop = useCallback((): void => {
    genRef.current += 1; // supersede the in-flight submit
    patchLastAssistant((prev) => (prev.text === "" ? { ...prev, text: "중단되었습니다." } : prev));
    setStatus("idle");
  }, [patchLastAssistant]);

  /** Re-run the most recent user turn: drop trailing assistant + that user msg,
   *  then resend. Shared by regenerate (success) and retry (error). */
  const rerunLast = useCallback((): void => {
    if (status === "streaming") return;
    const cur = messagesRef.current;
    let i = cur.length - 1;
    while (i >= 0 && cur[i]?.role === "assistant") i--;
    const userMsg = cur[i];
    if (userMsg === undefined || userMsg.role !== "user") return;
    commit(cur.slice(0, i));
    void runTurn(userMsg.text, userMsg.images ?? []);
  }, [commit, runTurn, status]);

  const editFrom = useCallback(
    (index: number): AkuDraft | null => {
      if (status === "streaming") return null;
      const cur = messagesRef.current;
      const msg = cur[index];
      if (msg === undefined || msg.role !== "user") return null;
      commit(cur.slice(0, index));
      return { text: msg.text, images: msg.images ?? [] };
    },
    [commit, status],
  );

  const clear = useCallback((): void => {
    genRef.current += 1;
    clearConversation(designId);
    commit([]);
    setStatus("idle");
  }, [commit, designId]);

  return {
    messages,
    status,
    send,
    stop,
    regenerate: rerunLast,
    retry: rerunLast,
    editFrom,
    clear,
    history,
  };
}
