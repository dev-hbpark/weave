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
import { WEAVE_CAPABILITIES, WEAVE_TASK_PRIMER } from "./weave-capabilities.js";
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
  /** False until an agent-server token is configured (env / saved / injected).
   *  When false, the panel shows the token-setup gate instead of the composer. */
  readonly hasToken: boolean;
  /** Save a token (persisted to this browser) → unblocks the connection. */
  setToken(token: string): void;
  /** Forget the saved token → returns the panel to the token-setup gate.
   *  Use when a wrong token was entered (connection keeps failing). */
  resetToken(): void;
}

/** Dev-default URL. Production must inject a real URL (the deployed weave is an
 *  anonymous shared workspace — see apps/web/CLAUDE.md). The TOKEN has no
 *  hardcoded fallback: when none is configured the panel prompts for it. */
const DEV_URL = "ws://localhost:8788";
const TOKEN_KEY = "weave.aku.token";
/** Fail a stuck connection attempt instead of hanging the panel forever. */
const CONNECT_TIMEOUT_MS = 15_000;

function envStr(key: string): string | undefined {
  const v = (import.meta.env as Record<string, unknown>)[key];
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** Token saved in this browser (per the no-account shared-workspace model). */
function loadToken(): string | null {
  try {
    const v = window.localStorage.getItem(TOKEN_KEY);
    return v !== null && v !== "" ? v : null;
  } catch {
    return null;
  }
}
function saveToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // private mode / quota — the token still works for this session (state).
  }
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
  // Token precedence: injected dep → env → saved-in-browser → none (prompt).
  const [token, setTokenState] = useState<string | null>(
    () => deps.token ?? envStr("VITE_AKU_AGENT_TOKEN") ?? loadToken(),
  );
  const hasToken = token !== null && token !== "";

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
    if (token === null || token === "") {
      return Promise.reject(new Error("no-token")); // gated by the UI; defensive
    }
    if (connectingRef.current === null) {
      const schema = getDocumentRef.current().schema as Schema | undefined;
      const connect = connectAgocraftAgent({
        editor,
        commands,
        getDocument: () => getDocumentRef.current(),
        schemas: WEAVE_COMMAND_SCHEMAS,
        // Curated, weave-accurate capabilities → grounds the agent's (cached)
        // system prompt in weave's kinds/attrs/coordinate model (WI-054 hardening).
        capabilities: WEAVE_CAPABILITIES,
        userId: `weave:${designId === "" ? "default" : designId}`,
        url,
        token,
        ...(schema !== undefined ? { schema } : {}),
      });
      // Fail fast if the server never completes the handshake; on ANY failure
      // clear the cached attempt so the next send reconnects cleanly.
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("연결 시간 초과")), CONNECT_TIMEOUT_MS),
      );
      connectingRef.current = Promise.race([connect, timeout]).then(
        (h) => {
          handleRef.current = h;
          return h;
        },
        (err) => {
          connectingRef.current = null;
          throw err;
        },
      );
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
      const assistantMsg: AkuAssistantMessage = {
        role: "assistant",
        text: "",
        edits: [],
        at: now,
        activity: "연결 중…",
      };
      commit([...messagesRef.current, userMsg, assistantMsg]);
      setStatus("streaming");

      const depthBefore = editor.history.undoSize();

      // Each submit is an independent server-side run (no conversation memory):
      // give it the weave conventions primer + the current selection (view-state,
      // absent from the document snapshot) so it can resolve "이걸 …" prompts.
      const selected = getSelectionRef.current();
      const selectionLine =
        selected.length > 0 ? `\n\n[컨텍스트] 현재 선택된 아이템 id: ${selected.join(", ")}` : "";
      const task = `${WEAVE_TASK_PRIMER}${selectionLine}\n\n${text}`;

      try {
        const handle = await getHandle();
        if (genRef.current !== gen) return;
        const res = await handle.submit(task, {
          // Attached images go to the server for vision (data URLs; the server
          // parses media-type + bytes into the model's first turn).
          ...(images.length > 0 ? { images } : {}),
          // `event` is the client's TaskEvent union (turn / response / tool). We
          // surface it as a live activity caption + accumulate tool edit-chips so
          // the panel visibly "works" before the final reply lands.
          onEvent: (event) => {
            if (genRef.current !== gen) return;
            if (event.type === "turn") {
              patchLastAssistant((prev) => ({ ...prev, activity: "생각 중…" }));
              return;
            }
            if (event.type === "response") {
              patchLastAssistant((prev) => ({
                ...prev,
                activity: event.toolUses > 0 ? "편집 적용 중…" : "정리 중…",
              }));
              return;
            }
            // tool
            patchLastAssistant((prev) => ({
              ...prev,
              activity: `${chipLabel(event.name)} ${event.ok ? "적용" : "실패"}`,
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

  /** Drop any link opened with a prior token so the next send reconnects fresh. */
  const dropLink = useCallback((): void => {
    genRef.current += 1;
    void handleRef.current?.close();
    handleRef.current = null;
    connectingRef.current = null;
  }, []);

  const setToken = useCallback(
    (next: string): void => {
      const t = next.trim();
      if (t === "") return;
      saveToken(t);
      dropLink();
      setTokenState(t);
    },
    [dropLink],
  );

  const resetToken = useCallback((): void => {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
    dropLink();
    setStatus("idle");
    setTokenState(null);
  }, [dropLink]);

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
    hasToken,
    setToken,
    resetToken,
  };
}
