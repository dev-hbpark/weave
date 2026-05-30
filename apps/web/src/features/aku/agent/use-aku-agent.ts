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

import {
  type AgentRunState,
  type ConnectionState,
  connectAgocraftAgent,
  INITIAL_AGENT_STATE,
  reduceAgentState,
  type ToolClientHandle,
} from "@agocraft/agent-client";
import type { Document as AgocraftDocument, CommandRegistry, Schema } from "@agocraft/core";
import { CommandRegistryToken, type Editor } from "@agocraft/editor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearConversation,
  loadConversation,
  persistConversation,
} from "../conversation-storage.js";
import type {
  AkuAssistantMessage,
  AkuConnection,
  AkuDraft,
  AkuHistoryController,
  AkuImage,
  AkuMessage,
  AkuStatus,
} from "../types.js";
import { makeRoundGroupingEditor } from "./round-grouping-editor.js";
import {
  WEAVE_CAPABILITIES,
  WEAVE_DOMAIN_KNOWLEDGE,
  WEAVE_TASK_PRIMER,
} from "./weave-capabilities.js";
import { WEAVE_COMMAND_LABELS, WEAVE_COMMAND_SCHEMAS } from "./weave-command-schemas.js";

export interface UseAkuAgent {
  readonly messages: ReadonlyArray<AkuMessage>;
  readonly status: AkuStatus;
  /** Reverse-MCP connection lifecycle, orthogonal to `status` (small-think DR-010). */
  readonly connection: AkuConnection;
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

// ── Ablation toggles (dev) ──────────────────────────────────────────────────
// Flip ONE piece off to test whether today's prompt enrichment is hurting the
// agent. These client-side pieces hot-reload instantly (no rebuild / restart).
// For the SERVER harness sections (CSS / editor-craft / templates / playbook),
// set SMALL_THINK_HARNESS_EXCLUDE=css,editor,template,… and restart the server.
const AKU_ABLATION = {
  /** false → send an EMPTY weave domain block (the server then injects no domain knowledge). */
  weaveDomain: true,
  /** false → do NOT prepend the per-task WEAVE_TASK_PRIMER to the request. */
  taskPrimer: true,
} as const;

function envStr(key: string): string | undefined {
  const v = (import.meta.env as Record<string, unknown>)[key];
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** Token saved in this browser (per the no-account shared-workspace model). */
function loadToken(): string | null {
  try {
    return "REDACTED-DEV-TOKEN";
    // const v = window.localStorage.getItem(TOKEN_KEY);
    // return v !== null && v !== "" ? v : null;
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

/** Connection-state → Korean banner caption (Rule 6: a record, not a switch). Healthy
 *  states (open) map to null = no banner. small-think DR-010. */
const CONNECTION_BANNER: Record<ConnectionState, string | null> = {
  idle: null,
  connecting: null, // brief first dial — the turn's own "연결 중…" activity covers it
  open: null,
  reconnecting: "연결이 끊겨 다시 연결하는 중이에요…",
  closed: null,
  error: "에이전트 서버에 연결하지 못했어요. 다시 시도해 주세요.",
};

function toConnection(state: ConnectionState): AkuConnection {
  return { state, banner: CONNECTION_BANNER[state] };
}

/** Derive the live bubble caption from the reduced agent run-state. A running tool
 *  names itself ("배경색 변경 적용 중…"); otherwise the phase drives the caption. */
function activityFor(st: AgentRunState): string | undefined {
  const running = st.activeTools.find((t) => t.status === "running");
  if (running !== undefined) return `${chipLabel(running.name)} 적용 중…`;
  if (st.phase === "thinking") return "생각 중…";
  if (st.phase === "streaming-text") return "정리 중…";
  if (st.phase === "tool-calling" || st.phase === "applying") return "편집 적용 중…";
  if (st.phase === "queued") return "연결 중…";
  return undefined; // done / error / aborted → caption cleared
}

/** Commands hidden from the agent (presets are UI-only — see the `commands` memo). */
const AGENT_HIDDEN_COMMAND_PREFIX = "weave.preset.";

/** A read-through view of the command registry with preset commands filtered out, so
 *  `describeCommands` (which reads `list()`) never advertises them as agent tools. The
 *  underlying registry is untouched — the editor keeps the commands for UI use. */
function withoutPresetCommands(registry: CommandRegistry): CommandRegistry {
  const hidden = (name: string): boolean => name.startsWith(AGENT_HIDDEN_COMMAND_PREFIX);
  return {
    ...registry,
    list: () => registry.list().filter((c) => !hidden(c.name)),
    has: (name: string) => !hidden(name) && registry.has(name),
    get: ((name: string) =>
      hidden(name) ? undefined : registry.get(name)) as CommandRegistry["get"],
  };
}

export function useAkuAgent(deps: {
  readonly editor: Editor;
  readonly getDocument: () => AgocraftDocument;
  readonly getSelection: () => ReadonlyArray<string>;
  /** Live design view-model info absent from the document snapshot — canvas px
   *  size + background. Injected per task so the agent can size text (fontSize
   *  is absolute design-px) relative to the actual canvas. */
  readonly getDesignInfo?: () => { width: number; height: number; background: string };
  readonly designId: string;
  readonly url?: string;
  readonly token?: string;
}): UseAkuAgent {
  const { editor, getDocument, getSelection, getDesignInfo, designId } = deps;
  const url = deps.url ?? envStr("VITE_AKU_AGENT_URL") ?? DEV_URL;
  // Token precedence: injected dep → env → saved-in-browser → none (prompt).
  const [token, setTokenState] = useState<string | null>(
    () => deps.token ?? envStr("VITE_AKU_AGENT_TOKEN") ?? loadToken(),
  );
  const hasToken = token !== null && token !== "";

  // DEV diagnostics for "token setup keeps showing despite a saved token". Reveals
  // whether the value is actually under TOKEN_KEY on THIS origin (key/origin mismatch,
  // empty value, or a VITE_AKU_AGENT_TOKEN override are the usual causes).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(TOKEN_KEY);
    } catch {
      raw = "(localStorage threw — blocked/private mode?)";
    }
    console.debug("[aku token] resolution", {
      key: TOKEN_KEY,
      rawLocalStorage: raw,
      fromEnvVITE_AKU_AGENT_TOKEN: envStr("VITE_AKU_AGENT_TOKEN"),
      fromStorage: loadToken(),
      origin: window.location.origin,
      hasToken,
      note: "resolved = deps.token ?? env ?? storage; the setup screen shows when this is null/empty",
    });
  }, [hasToken]);

  const [messages, setMessages] = useState<ReadonlyArray<AkuMessage>>(() =>
    loadConversation(designId),
  );
  const [status, setStatus] = useState<AkuStatus>("idle");
  const [connection, setConnection] = useState<AkuConnection>(() => toConnection("idle"));
  const messagesRef = useRef<ReadonlyArray<AkuMessage>>(messages);

  // Latest-value refs so the stable callbacks never go stale.
  const getDocumentRef = useRef(getDocument);
  getDocumentRef.current = getDocument;
  const getSelectionRef = useRef(getSelection);
  getSelectionRef.current = getSelection;
  const getDesignInfoRef = useRef(getDesignInfo);
  getDesignInfoRef.current = getDesignInfo;

  // One reverse-MCP link per mounted hook, opened lazily on first send.
  const handleRef = useRef<ToolClientHandle | null>(null);
  const connectingRef = useRef<Promise<ToolClientHandle> | null>(null);
  // Unsubscribe handle for the current handle's connection-state subscription.
  const offStateRef = useRef<(() => void) | null>(null);
  // The in-flight task id (captured via submit's onSubmit) so stop() can cancel it
  // server-side, not just locally supersede it (small-think DR-011).
  const activeTaskIdRef = useRef<string | null>(null);
  // Supersession token: stop / clear / a new send invalidate an in-flight submit
  // (the server keeps running unless we also cancel; we ignore its late resolution).
  const genRef = useRef(0);

  // The agent gets the full command registry MINUS preset commands: presets are a
  // UI-only convenience (the slide-template picker), and the model can't know valid
  // presetIds so it guessed and got `preset-not-found`. The agent builds slides the
  // direct way instead — add a top-level frame into the design root (weave.item.add
  // { kind:'frame' }). Hiding them from `list()` keeps them out of the advertised
  // tools; the editor still has them for the UI (exec runs through `editor`, not here).
  const commands = useMemo(
    () => withoutPresetCommands(editor.container.resolve(CommandRegistryToken)),
    [editor],
  );
  // WI-060 — group each agent ROUND's tool calls into one undo entry. The bridge
  // drives THIS proxy editor (begin/end an async-spanning transaction group per
  // round); history/undo elsewhere keep using the real `editor`. `close()` is
  // called on every run end / stop / unmount so a group never outlives a run.
  const roundGroup = useMemo(() => makeRoundGroupingEditor(editor), [editor]);
  const roundGroupRef = useRef(roundGroup);
  roundGroupRef.current = roundGroup;
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
      roundGroupRef.current.close();
      offStateRef.current?.();
      offStateRef.current = null;
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
      // connectTimeoutMs + auto-reconnect + heartbeat are owned by the library now
      // (small-think DR-010): no consumer-side Promise.race, and transient drops
      // self-heal — the handle re-dials and re-submits in-flight turns.
      const connect = connectAgocraftAgent({
        // The bridge runs every agent tool call through this proxy so a round's
        // calls share one transaction id → one Cmd+Z (WI-060).
        editor: roundGroup.editor,
        commands,
        getDocument: () => getDocumentRef.current(),
        schemas: WEAVE_COMMAND_SCHEMAS,
        // Curated, weave-accurate capabilities → grounds the agent's (cached)
        // system prompt in weave's kinds/attrs/coordinate model (WI-054 hardening).
        capabilities: WEAVE_CAPABILITIES,
        // Initialization step: transfer weave's stable design-domain expertise ONCE
        // at connect (the ctl hello). The server caches it as "# weave domain
        // knowledge", grounding every task in how weave's model works (WI-054+).
        domain: { name: "weave", text: AKU_ABLATION.weaveDomain ? WEAVE_DOMAIN_KNOWLEDGE : "" },
        userId: `weave:${designId === "" ? "default" : designId}`,
        url,
        token,
        connectTimeoutMs: CONNECT_TIMEOUT_MS,
        ...(schema !== undefined ? { schema } : {}),
      });
      // On ANY first-connect failure clear the cached attempt so the next send
      // reconnects cleanly. On success, subscribe to the connection lifecycle so the
      // panel can render connecting / reconnecting / failed banners.
      connectingRef.current = connect.then(
        (h) => {
          handleRef.current = h;
          setConnection(toConnection(h.state));
          offStateRef.current = h.onStateChange((detail) =>
            setConnection(toConnection(detail.state)),
          );
          return h;
        },
        (err) => {
          connectingRef.current = null;
          setConnection(toConnection("error"));
          throw err;
        },
      );
    }
    return connectingRef.current;
  }, [editor, roundGroup, commands, designId, url, token]);

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

  // Upload attached images to weave's resource store so the agent can reference
  // the resulting URLs in attrs.src (asset use, not just vision). Returns the
  // canonical URLs (skips any that fail — those stay vision-only). Lazy-imports
  // cloud-sync to keep it off the canvas-critical path.
  const uploadImages = useCallback(
    async (imgs: ReadonlyArray<AkuImage>): Promise<ReadonlyArray<string>> => {
      try {
        const { uploadResourceCloud } = await import("../../../document/cloud-sync.js");
        const results = await Promise.all(
          imgs.map((im, i) =>
            uploadResourceCloud("image", im.dataUrl, im.name ?? `aku-image-${i + 1}`),
          ),
        );
        return results.map((r) => r?.src).filter((s): s is string => typeof s === "string");
      } catch {
        return []; // offline / no resource API → vision-only
      }
    },
    [],
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

      // Attached images serve two roles: (a) VISION — raw bytes go to the model
      // via submit({ images }); (b) ASSET — upload them so the agent can drop the
      // resulting URL into attrs.src ("use this image as the slide background").
      let assetLines = "";
      if (images.length > 0) {
        patchLastAssistant((prev) => ({ ...prev, activity: "이미지 업로드 중…" }));
        const urls = await uploadImages(images);
        if (genRef.current !== gen) return;
        if (urls.length > 0) {
          assetLines =
            "\n\n[첨부 이미지 에셋] 아래 URL을 weave.item.add 의 attrs.src 로 사용해 디자인에 넣을 수 있어요 (이미지 자체는 모델이 이미 봅니다):\n" +
            urls.map((u, i) => `${i + 1}. ${u}`).join("\n");
        }
      }

      // Each submit is an independent server-side run (no conversation memory):
      // primer + design info + image assets + current selection (all view-state,
      // absent from the document snapshot) so it can size text against the canvas
      // and resolve "이걸 …" / "이 이미지를 …" prompts.
      const design = getDesignInfoRef.current?.();
      const designLine =
        design !== undefined
          ? `\n\n[디자인] 캔버스 ${design.width}×${design.height}px · 배경 ${design.background} · frame 좌표(x/y/width/height)는 부모 프레임 대비 0..1 비율(최상위 아이템의 부모 = 디자인 캔버스 전체), fontSize·letterSpacing 등 타이포 크기는 이 캔버스 기준 절대 px`
          : "";
      const selected = getSelectionRef.current();
      const selectionLine =
        selected.length > 0 ? `\n\n[컨텍스트] 현재 선택된 아이템 id: ${selected.join(", ")}` : "";
      const primer = AKU_ABLATION.taskPrimer ? WEAVE_TASK_PRIMER : "";
      const task = `${primer}${designLine}${assetLines}${selectionLine}\n\n${text}`;

      try {
        const handle = await getHandle();
        if (genRef.current !== gen) return;
        // Fold the streamed lifecycle events into one canonical run-state (the library
        // reducer, small-think DR-011) and derive the bubble's caption + edit-chips
        // from it — `tool-start` shows a tool as running before it settles, and unknown
        // future event kinds are ignored (onUnknown: preserve).
        let runState: AgentRunState = INITIAL_AGENT_STATE;
        const res = await handle.submit(task, {
          // Attached images go to the server for vision (data URLs; the server
          // parses media-type + bytes into the model's first turn).
          ...(images.length > 0 ? { images } : {}),
          // Capture the server-assigned task id so stop() can cancel THIS run.
          onSubmit: (id) => {
            activeTaskIdRef.current = id;
          },
          onEvent: (event) => {
            if (genRef.current !== gen) return;
            // DEV: every event the server streams (turn / message / tool-start / tool /
            // response / done / error). A `tool` with ok:false is a failed edit — pair
            // it with the matching "[aku exec ✗]" log to see WHY (apps/web/CLAUDE.md).
            if (import.meta.env.DEV) console.debug("[aku event]", event.type, event);
            runState = reduceAgentState(runState, event);
            // The model's prose (`message`) is not carried in the run-state → append it.
            if (event.type === "message") {
              patchLastAssistant((prev) => ({
                ...prev,
                text: prev.text === "" ? event.text : `${prev.text}\n\n${event.text}`,
              }));
            }
            const activity = activityFor(runState);
            patchLastAssistant((prev) => ({
              ...prev,
              ...(activity !== undefined ? { activity } : {}),
              edits: runState.activeTools.map((t) => ({
                tool: t.name,
                summary: chipLabel(t.name),
                ok: t.status !== "error",
              })),
            }));
          },
        });
        if (genRef.current !== gen) return;
        // DEV: the final server response — ok/error, truncated flag, and the per-tool
        // ok/false summary. If toolCalls are all ok:false, the run "succeeded" but no
        // edit landed → cross-reference the "[aku exec ✗]" logs for the reason.
        if (import.meta.env.DEV) {
          console.debug("[aku result]", {
            ok: res.ok,
            error: res.error,
            truncated: res.truncated,
            finalText: res.finalText,
            toolCalls: res.toolCalls,
          });
        }
        const depthAfter = editor.history.undoSize();
        const succeeded = res.ok && res.error === undefined;
        // The server continues truncated turns so edits still land, but it flags when
        // the run brushed the token cap — surface it so the user can ask to continue
        // if something looks unfinished (truncation safety net, A+B+E).
        const truncatedNote =
          succeeded && res.truncated === true
            ? '\n\n⚠️ 응답이 길어 일부 편집이 빠졌을 수 있어요. 빠진 게 있으면 "계속"이라고 말씀해 주세요.'
            : "";
        patchLastAssistant((prev) => ({
          ...prev,
          // Keep the streamed prose if we got any; else fall back to finalText, or
          // a confirmation when the turn was pure tool calls with no prose.
          text:
            (succeeded
              ? prev.text !== ""
                ? prev.text
                : (res.finalText ?? "완료했어요.")
              : (res.error ?? "요청을 처리하지 못했어요.")) + truncatedNote,
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
        // Close the round's transaction group so it never spans past the run
        // (a lingering open group would let a later user edit merge into the
        // agent's undo entry). The idle timer would also close it, but the run
        // is definitively over here.
        roundGroupRef.current.close();
        if (genRef.current === gen) {
          setStatus("idle");
          activeTaskIdRef.current = null;
        }
      }
    },
    [commit, editor, getHandle, patchLastAssistant, uploadImages],
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
    genRef.current += 1; // supersede the in-flight submit (ignore its late resolution)
    // Actually cancel the run server-side (small-think DR-011) — not just locally —
    // so the agent stops issuing further tool calls. Edits already committed stay
    // (the user undoes them via History); this only halts further ones.
    const id = activeTaskIdRef.current;
    if (id !== null) handleRef.current?.cancel(id);
    activeTaskIdRef.current = null;
    // Close any open round group so the aborted run's edits don't keep
    // absorbing later transactions.
    roundGroupRef.current.close();
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

  /** Retry after a failure: if the connection itself died (reconnect exhausted),
   *  force a fresh attempt first; the re-run then rides the recovered link. */
  const retry = useCallback((): void => {
    if (handleRef.current !== null && handleRef.current.state === "error") {
      handleRef.current.reconnect();
    }
    rerunLast();
  }, [rerunLast]);

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
    offStateRef.current?.();
    offStateRef.current = null;
    void handleRef.current?.close();
    handleRef.current = null;
    connectingRef.current = null;
    setConnection(toConnection("idle"));
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
    connection,
    send,
    stop,
    regenerate: rerunLast,
    retry,
    editFrom,
    clear,
    history,
    hasToken,
    setToken,
    resetToken,
  };
}
