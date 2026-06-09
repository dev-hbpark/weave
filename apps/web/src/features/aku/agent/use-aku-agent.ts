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
  type ClarifyRequest,
  type ConnectionState,
  connectAgocraftAgent,
  INITIAL_AGENT_STATE,
  type QueueStatus,
  reduceAgentState,
  type ServerInfo,
  type ToolClientHandle,
} from "@agocraft/agent-client";
import type { Document as AgocraftDocument, Schema } from "@agocraft/core";
import { CommandRegistryToken, type Editor } from "@agocraft/editor";
import { DEFAULT_THEME, THEMES } from "@weave/design-system";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearConversation,
  loadConversation,
  persistConversation,
} from "../conversation-storage.js";
import { collectDiversitySample } from "../diversity/collector.js";
import type { SigDocument } from "../diversity/diversity-metric.js";
import type {
  AkuAssistantMessage,
  AkuConnection,
  AkuDraft,
  AkuHistoryController,
  AkuImage,
  AkuMessage,
  AkuStatus,
} from "../types.js";
import { stampContainerGuard } from "./agent-container-guard.js";
import { stampMinSizeGuard } from "./agent-min-size-guard.js";
import { decideResume } from "./agent-resume.js";
import { fixAgentTextBox } from "./agent-text-resize.js";
import { type AkuSettings, DEFAULT_AKU_SETTINGS, jitteredTemperature } from "./aku-settings.js";
import { autoStyleDirective, composeStyleTask, resolveStyleSelection } from "./design-styles.js";
import { classifyIntent, intentFromOperation } from "./intent/classifier.js";
import { composeIntentTask } from "./intent/compose-intent-task.js";
import { ALL_OPERATIONS, type IntentPlan, type Operation } from "./intent/types.js";
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
  /** The agent-server's announced active configuration (execution mode + the model /
   *  speed knobs it is actually running with), or null until it arrives on connect.
   *  Descriptive only — never carries secrets. Surfaced in the panel header. */
  readonly serverInfo: ServerInfo | null;
  /** The agent-server's live job-queue view for this client (WI-034): running/queued
   *  counts across the server + this client's own jobs with positions. null until it
   *  arrives on connect (and on older servers). Surfaced in the panel header. */
  readonly queueStatus: QueueStatus | null;
  /** Cancel a specific server-side job by its task id (queued OR running) — used by the
   *  queue chip's cancel affordance. No-op for an unknown id. */
  cancelJob(taskId: string): void;
  /** A pending pre-generation "which media item types?" question from the server,
   *  or null. The panel renders a picker; answering it resolves the agent's run. */
  readonly pendingClarify: { readonly req: ClarifyRequest } | null;
  /** Answer the pending clarify question with the selected item-type names. */
  resolveClarify(types: readonly string[]): void;
  /** `opts.styleId` picks a named DESIGN STYLE (see DESIGN_STYLES); omit/null → 자동
   *  (the agent reads the content and picks the best-fit style, when auto is on). A
   *  per-request variation keeps within-style diversity (DR-079).
   *  `opts.styleRefImages` are style-reference images (mimic palette/tone). */
  send(
    text: string,
    images?: ReadonlyArray<AkuImage>,
    opts?: {
      styleId?: string | null;
      styleRefImages?: ReadonlyArray<AkuImage>;
      /** Full explicit editing intent (chip pick) — bypasses the classifier (WI-148). */
      intent?: IntentPlan;
      /** Explicit operation only (slash command) — target/tone resolved internally. */
      intentOp?: Operation;
    },
  ): void;
  stop(): void;
  /** Re-run the most recent user turn (drops its response first). */
  regenerate(): void;
  /** Re-run the most recent user turn with a CORRECTED intent (chip edit, WI-148). */
  correctIntent(plan: IntentPlan): void;
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

/** Per-task `[현재 테마]` line: the live editor theme (name + dark/light tone),
 *  read off `<html data-theme>`. The agent uses the tone to keep any LITERAL
 *  colors readable on the active surface; structural color stays in var(--token)
 *  so it follows whatever theme the user switches to. Empty string when the DOM
 *  isn't available (SSR / tests) or the attr is an unknown name. */
/** All theme names, for the optional `[테마 추천]` instruction's choice list. */
const THEME_NAME_LIST = THEMES.map((t) => t.name).join(" / ");

function currentThemeLine(): string {
  if (typeof document === "undefined") return "";
  const name = document.documentElement.getAttribute("data-theme") ?? DEFAULT_THEME;
  const meta = THEMES.find((t) => t.name === name);
  if (meta === undefined) return "";
  return `\n\n[현재 테마] ${meta.label} — ${meta.tone === "dark" ? "어두운" : "밝은"} 테마 (${meta.hint}). 구조 색(배경·텍스트·강조)은 var(--token)으로 두면 사용자가 테마를 바꿔도 자동으로 이 팔레트를 따라갑니다.`;
}

/** Derive the live bubble caption from the reduced agent run-state. A running tool
 *  names itself ("배경색 변경 적용 중…"); otherwise the phase drives the caption. */
function activityFor(st: AgentRunState): string | undefined {
  const running = st.activeTools.find((t) => t.status === "running");
  if (running !== undefined) return `${chipLabel(running.name)} 적용 중…`;
  if (st.phase === "thinking") return "생각 중…";
  // Commands-only product: the server runs no-prose (SMALL_THINK_COMMANDS_ONLY / byo-ssh
  // headless), so Aku never authors a user-facing reply. The `streaming-text` phase is
  // therefore not a real "정리" step worth advertising — it's the loop's terminal/stray
  // text turn. Return undefined so the onEvent merge leaves the prior caption untouched
  // (e.g. the last "○○ 적용 중…" / "생각 중…") instead of flashing a phantom "정리 중…"
  // finalizing step. The server-side `message` drop (byo-ssh-session.ts) is the primary
  // fix; this is the client-side guarantee for any event that still slips through (A+B).
  if (st.phase === "streaming-text") return undefined;
  if (st.phase === "tool-calling" || st.phase === "applying") {
    // After a tool SETTLES there's no `running` tool, but we're still mid-edit
    // (phase tool-calling/applying). The tool-start→settle window is milliseconds
    // for weave edits, so keying the operation mood (추가/수정/…) only off `running`
    // made those sprites flash sub-frame. Keep naming the MOST RECENT tool so the
    // per-operation caption — and the mood/sprite it drives — persists across the
    // whole operation window, not just the running instant (WI-118).
    const last = st.activeTools[st.activeTools.length - 1];
    return last !== undefined ? `${chipLabel(last.name)} 적용 중…` : "편집 적용 중…";
  }
  if (st.phase === "queued") return "연결 중…";
  return undefined; // done / error / aborted → caption cleared
}

// WI-095 (DR-064) — NO commands are hidden from the agent anymore. The previously
// hidden set (preset.* + the WI-063 subsumed setters setFill / setCornerRadius /
// setVertices / setDecoration / image.setCrop / item.flip, the multi-selection
// legacy items.resizeMulti / items.remove / items.duplicate, and doc.reset) is now
// fully advertised: every one carries a curated schema in WEAVE_COMMAND_SCHEMAS
// (presets gained a closed presetId enum so the agent can't guess an invalid id).
// The consolidated commands (weave.item.add / weave.item.update / weave.items.update
// / weave.items.lifecycle) remain the preferred path; the re-exposed setters are
// redundant-but-available direct alternatives. The agent therefore sees the FULL
// registered command set — `describeCommands` reads the registry's `list()` as-is.

export function useAkuAgent(deps: {
  readonly editor: Editor;
  readonly getDocument: () => AgocraftDocument;
  readonly getSelection: () => ReadonlyArray<string>;
  /** Live design view-model info absent from the document snapshot — canvas px
   *  size + background. Injected per task so the agent can size text (fontSize
   *  is absolute design-px) relative to the actual canvas. */
  readonly getDesignInfo?: () => { width: number; height: number; background: string };
  readonly designId: string;
  /** WI-065 — called after a turn that ADDED top-level frame(s), so the host can
   *  fit the camera to the new content (agent edits go straight through
   *  editor.exec and never trigger the UI's add-time fit, so without this an
   *  agent-built deck stays at the base ~100% view instead of the shared 70%). */
  readonly onFramesAdded?: () => void;
  /** User-toggleable behavior flags (gear panel). Optional → defaults applied. */
  readonly settings?: AkuSettings;
  readonly url?: string;
  readonly token?: string;
  /** True once the SAVED design has finished loading (WI-034 4b). Gates connect-on-init:
   *  Aku opens the link as soon as this is true (so a refresh reconnects within the server's
   *  grace window) — but never before the design is loaded, so a grace-replayed job edits the
   *  real document, not an empty placeholder (load-order). Absent/false → legacy lazy connect. */
  readonly designLoaded?: boolean;
}): UseAkuAgent {
  // Render-stable values are destructured from `deps` HERE, once. Everything
  // volatile (the getters + callbacks like onFramesAdded) is read inside the
  // long-lived callbacks via `depsRef.current.*` (set up below). There is
  // intentionally NO other `deps.<member>` access anywhere in this file — a
  // guard test (use-aku-agent.deps-guard.test.ts) enforces it, so a future dep
  // can never be read straight off the first-render `deps` and go stale
  // (WI-075 / DR-030).
  const { editor, designId, url: urlProp, token: tokenProp, designLoaded } = deps;
  const url = urlProp ?? envStr("VITE_AKU_AGENT_URL") ?? DEV_URL;
  // Token precedence: injected dep → env → saved-in-browser → none (prompt).
  const [token, setTokenState] = useState<string | null>(
    () => tokenProp ?? envStr("VITE_AKU_AGENT_TOKEN") ?? loadToken(),
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
      note: "resolved = injected token ?? env ?? storage; the setup screen shows when this is null/empty",
    });
  }, [hasToken]);

  const [messages, setMessages] = useState<ReadonlyArray<AkuMessage>>(() =>
    loadConversation(designId),
  );
  const [status, setStatus] = useState<AkuStatus>("idle");
  const [connection, setConnection] = useState<AkuConnection>(() => toConnection("idle"));
  // Server config announced on connect (mode + perf knobs); null until it arrives.
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  // Live job-queue view pushed by the server (WI-034); null until it arrives.
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  // Pre-generation media-type question (small-think clarify): when the server asks
  // before creating a design, we surface a picker and resolve once the user answers.
  const [pendingClarify, setPendingClarify] = useState<{
    readonly req: ClarifyRequest;
    readonly resolve: (types: readonly string[]) => void;
  } | null>(null);
  // Stable handler (a ref → reconnects don't re-create it). Returns a promise the
  // server's onClarify awaits; resolved by the picker via resolveClarify. When
  // "생성 전 질문 받기" is off, skip the picker and answer "none" immediately.
  // Settings are read off `depsRef.current` (DR-030) — the closure runs at
  // clarify time, well after `depsRef` is initialised.
  const onClarifyRef = useRef(
    (req: ClarifyRequest): Promise<readonly string[]> =>
      (depsRef.current.settings ?? DEFAULT_AKU_SETTINGS).askBeforeGenerate
        ? new Promise<readonly string[]>((resolve) => setPendingClarify({ req, resolve }))
        : Promise.resolve([]),
  );
  const resolveClarify = useCallback((types: readonly string[]): void => {
    setPendingClarify((cur) => {
      cur?.resolve(types);
      return null;
    });
  }, []);
  const messagesRef = useRef<ReadonlyArray<AkuMessage>>(messages);

  // Single latest-value mirror of the WHOLE `deps` object. Every read of a
  // volatile dep — the getters AND the callbacks like `onFramesAdded` — inside
  // the long-lived async callbacks (runTurn 등) MUST go through
  // `depsRef.current.*`. Reading `deps.X` directly there captures the
  // first-render value forever, because those callbacks are memoized with a
  // stable dependency array that intentionally omits `deps`. Consolidating the
  // former per-field refs into one mirror means a NEW dep needs zero ref wiring
  // and can never silently go stale (WI-075 / DR-030 — the `onFramesAdded`
  // agent-fit-at-70% regression came from a missing per-field ref here).
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // One reverse-MCP link per mounted hook, opened lazily on first send.
  const handleRef = useRef<ToolClientHandle | null>(null);
  const connectingRef = useRef<Promise<ToolClientHandle> | null>(null);
  // Unsubscribe handle for the current handle's connection-state subscription.
  const offStateRef = useRef<(() => void) | null>(null);
  // The in-flight task id (captured via submit's onSubmit) so stop() can cancel it
  // server-side, not just locally supersede it (small-think DR-011).
  const activeTaskIdRef = useRef<string | null>(null);
  // Per-request variation seed (DR-077 D3). Advances on every submit — incl. a
  // "regenerate" of the same tone+text — so the free-axis sampling and the
  // temperature jitter both shift, breaking same-tone convergence. Random start
  // so a session doesn't always open on the same variation.
  const variationSeedRef = useRef<number>(Math.floor(Math.random() * 997));
  // Supersession token: stop / clear / a new send invalidate an in-flight submit
  // (the server keeps running unless we also cancel; we ignore its late resolution).
  const genRef = useRef(0);
  // WI-151 — resume-on-reconnect bookkeeping (see the queueStatus effect below).
  // `engagedRef`: the user has driven the agent THIS page session (submit / stop /
  // clear). Until then a server-reported own job is an orphan from a PRIOR session
  // that the server resumed — adopt it. After engagement the local run lifecycle
  // owns every job, so adoption is disabled (no false dim at a local run's tail).
  const engagedRef = useRef(false);
  // `resumedRef`: we currently hold a server-ADOPTED run (no local task id). Stop
  // cancels it by the server-reported job id; release flips back to idle when it
  // leaves the queue.
  const resumedRef = useRef(false);
  // Latest queueStatus mirror so stop()/effects read it without re-creating callbacks.
  const queueStatusRef = useRef<QueueStatus | null>(null);
  queueStatusRef.current = queueStatus;

  // WI-095 (DR-064) — the agent gets the FULL command registry (no hiding). Every
  // weave.* command is advertised as a tool; presets carry a closed presetId enum
  // (the prior preset-not-found guessing was the reason they were hidden), and the
  // re-exposed setters are redundant-but-available alternatives to the consolidated
  // item.add / item.update commands.
  const commands = useMemo(() => editor.container.resolve(CommandRegistryToken), [editor]);
  // DEV diagnostic for the "No command registered with name weave.item.add" class
  // of runtime errors (stale build / registry mismatch). Logs the command set the
  // agent is actually given at connect time. If `hasItemAdd` is false or `count` is
  // tiny here while the source registers the command (commands.ts buildWeaveCommands
  // → registerWeaveCommands), the running bundle is out of sync with source
  // (rebuild/restart) OR this resolved CommandRegistry is not the instance
  // registerWeaveCommands populated. Gated behind DEV so production never logs.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const names = commands.list().map((c) => c.name);
    console.debug("[aku commands] exposed to agent", {
      count: names.length,
      hasItemAdd: commands.has("weave.item.add"),
      names,
    });
  }, [commands]);
  // WI-060 — group each agent ROUND's tool calls into one undo entry. The bridge
  // drives THIS proxy editor (begin/end an async-spanning transaction group per
  // round); history/undo elsewhere keep using the real `editor`. `close()` is
  // called on every run end / stop / unmount so a group never outlives a run.
  const roundGroup = useMemo(
    () =>
      makeRoundGroupingEditor(editor, {
        // Agent-only input transforms (the toolbar never goes through this proxy):
        //  • DR-098 — agent-created text gets a FIXED-size box (free placement only).
        //  • DR-101 — font size is FIXED design-px; NO px→ratio grounding (DR-091
        //    superseded) so text never rescales when a frame/parent is resized.
        //  • WI-147 — switch ON the command's min-size reject for agent adds only.
        //  • WI-150 — switch ON the command's container-is-frame reject (needs no
        //    design px, so it is stamped before the design-undefined early return).
        transformInput: (commandName, input) => {
          const doc = depsRef.current.getDocument();
          const sized = fixAgentTextBox(commandName, input, doc);
          const guarded = stampContainerGuard(commandName, sized);
          const design = depsRef.current.getDesignInfo?.();
          if (design === undefined) return guarded;
          return stampMinSizeGuard(commandName, guarded, design);
        },
      }),
    [editor],
  );
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

  // Persist on every change (best-effort, designId-keyed) — unless the user
  // turned "대화 기록 저장" off.
  useEffect(() => {
    if ((depsRef.current.settings ?? DEFAULT_AKU_SETTINGS).persistHistory)
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate dependency array — omitted values are refs/stable handles or an intentional re-run trigger (see hook body); auto-expanding changes the effect's semantics
  const getHandle = useCallback((): Promise<ToolClientHandle> => {
    if (handleRef.current !== null) return Promise.resolve(handleRef.current);
    if (token === null || token === "") {
      return Promise.reject(new Error("no-token")); // gated by the UI; defensive
    }
    if (connectingRef.current === null) {
      const schema = depsRef.current.getDocument().schema as Schema | undefined;
      // connectTimeoutMs + auto-reconnect + heartbeat are owned by the library now
      // (small-think DR-010): no consumer-side Promise.race, and transient drops
      // self-heal — the handle re-dials and re-submits in-flight turns.
      const connect = connectAgocraftAgent({
        // The bridge runs every agent tool call through this proxy so a round's
        // calls share one transaction id → one Cmd+Z (WI-060).
        editor: roundGroup.editor,
        commands,
        getDocument: () => depsRef.current.getDocument(),
        schemas: WEAVE_COMMAND_SCHEMAS,
        // Curated, weave-accurate capabilities → grounds the agent's (cached)
        // system prompt in weave's kinds/attrs/coordinate model (WI-054 hardening).
        capabilities: WEAVE_CAPABILITIES,
        // Initialization step: transfer weave's stable design-domain expertise ONCE
        // at connect (the ctl hello). The server caches it as "# weave domain
        // knowledge", grounding every task in how weave's model works (WI-054+).
        domain: { name: "weave", text: AKU_ABLATION.weaveDomain ? WEAVE_DOMAIN_KNOWLEDGE : "" },
        // Opt into the server's pre-generation "which media item types?" question.
        onClarify: (req) => onClarifyRef.current(req),
        // The server announces its active config (mode + model/speed knobs) on connect;
        // surface it in the panel header so the operator sees what's actually running.
        onServerInfo: (info) => setServerInfo(info),
        // Live queue view (WI-034): running/queued + this client's positions.
        onQueueStatus: (s) => setQueueStatus(s),
        userId: `weave:${designId === "" ? "default" : designId}`,
        // Stable client identity for the server's grace window — deterministic from the
        // design id so a reconnect / refresh of THIS design re-presents the same id and the
        // server replays its in-flight requests (WI-034 P2). Absent for an unsaved design.
        ...(designId !== "" ? { clientId: `weave-client:${designId}` } : {}),
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

  // Connect-on-init (WI-034 4b): once the SAVED design has loaded and a token is present, open
  // the link eagerly (instead of lazily on first submit) so a browser refresh reconnects within
  // the server's grace window and the server replays this design's in-flight job. Gated on
  // `designLoaded` for load-order — a replayed job then edits the real document, never an empty
  // placeholder. `getHandle` is idempotent (returns the existing handle), so this is a no-op once
  // connected; failures fall back to the lazy path on the next submit.
  useEffect(() => {
    if (designLoaded !== true || !hasToken) return;
    if (handleRef.current !== null || connectingRef.current !== null) return;
    void getHandle().catch(() => {
      /* first-connect failure clears the cached attempt; next submit retries (see getHandle) */
    });
  }, [designLoaded, hasToken, getHandle]);

  // WI-151 — RESUME the design dim + roaming after a reconnect / browser refresh.
  // The server keeps a dropped run alive for its grace window and re-runs it on
  // reconnect (WI-034); a live-socket reconnect keeps `status` in memory, but a
  // REFRESH resets it to "idle", leaving dim (AkuInteractionLock) + roaming
  // (useAkuRoam) — both gated solely on status === "streaming" — OFF while the
  // agent is editing again. `queueStatus.jobs` is now a GLOBAL list (WI-035 — every
  // client's jobs), so filter to `j.own` for OUR in-flight count; a Stop deletes the
  // request from the server's inflight set so a stopped run never appears here. On a
  // fresh page session (engagedRef false) an own job is therefore an orphan the user
  // did NOT stop and the server resumed → ADOPT it (flip to "streaming", lighting dim
  // + roaming via the single existing gate, with zero changes to those components).
  // RELEASE back to idle when it leaves the queue. A LOCAL run sets engagedRef, so
  // runTurn owns its lifecycle and this never adopts/releases it. Pure decideResume.
  useEffect(() => {
    const action = decideResume({
      ownJobCount: queueStatus?.jobs.filter((j) => j.own).length ?? 0,
      status,
      engaged: engagedRef.current,
      resumed: resumedRef.current,
    });
    if (action === "adopt") {
      resumedRef.current = true;
      setStatus("streaming");
    } else if (action === "release") {
      resumedRef.current = false;
      setStatus("idle");
    }
  }, [queueStatus, status]);

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
    async (
      text: string,
      images: ReadonlyArray<AkuImage>,
      opts?: {
        styleId?: string | null;
        styleRefImages?: ReadonlyArray<AkuImage>;
        /** Full explicit plan (chip correction). */
        intent?: IntentPlan;
        /** Explicit operation only (slash command) — target/tone resolved here. */
        intentOp?: Operation;
      },
    ): Promise<void> => {
      const s = depsRef.current.settings ?? DEFAULT_AKU_SETTINGS;
      const styleId = opts?.styleId;
      const styleRefImages =
        s.styleReference && opts?.styleRefImages !== undefined ? opts.styleRefImages : [];
      // ── Intent routing (WI-148 / DR-102; Phase 2b wire) ───────────────────────
      // Resolve the editing intent unless routing is off. Explicit plan (chip) or
      // operation (slash) wins; else classify in-browser. BOTH "client" and "server"
      // classify locally so the directive + chip are always present. The difference:
      // in "server" mode we ALSO send the operation over the wire so the small-think
      // harness tunes the review-pipeline passes per operation (WI-033 — the
      // server-only lever the client can't reach). "off" → no routing.
      const hasSelection = depsRef.current.getSelection().length > 0;
      const explicitPick = opts?.intent !== undefined || opts?.intentOp !== undefined;
      const intentPlan: IntentPlan | undefined =
        s.intentSource === "off"
          ? undefined
          : (opts?.intent ??
            (opts?.intentOp !== undefined
              ? intentFromOperation(opts.intentOp, text, { hasSelection })
              : classifyIntent(text, { hasSelection })));
      // Wire intent (server mode only): send the operation so the harness tunes its
      // review passes (small-think WI-033). Send ONLY an EXPLICIT pick (slash / chip) —
      // for an auto turn we let the SERVER classify (it may use a more accurate LLM
      // classifier), then reflect its choice on the chip via the `intent` event below.
      // The local `intentPlan` still drives the task DIRECTIVE + the initial chip.
      const wireIntent =
        s.intentSource === "server" && explicitPick && intentPlan !== undefined
          ? { operation: intentPlan.operation }
          : undefined;
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
        // Surface the routed intent on the turn so the chip can render + be corrected.
        ...(intentPlan !== undefined && s.showIntentChip ? { intent: intentPlan } : {}),
      };
      commit([...messagesRef.current, userMsg, assistantMsg]);
      // WI-151 — the user has driven the agent this session; from now on every
      // server job is owned by this local run lifecycle, so the resume effect
      // stops adopting (no false dim at a finished local run's tail).
      engagedRef.current = true;
      setStatus("streaming");

      const depthBefore = editor.history.undoSize();
      // WI-065 — top-level frame count before the turn; if it grows, the agent
      // added slide(s) and we fit the camera afterwards (see below).
      const rootFramesBefore = depsRef.current.getDocument().root.children.length;

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
      const design = depsRef.current.getDesignInfo?.();
      const designLine =
        design !== undefined
          ? `\n\n[디자인] 캔버스 ${design.width}×${design.height}px · 배경 ${design.background} (타이포 크기는 이 캔버스 px 기준 절대값; frame 좌표는 부모 대비 0..1 비율)`
          : "";
      const selected = depsRef.current.getSelection();
      const selectionLine =
        selected.length > 0 ? `\n\n[컨텍스트] 현재 선택된 아이템 id: ${selected.join(", ")}` : "";
      const primer = AKU_ABLATION.taskPrimer ? WEAVE_TASK_PRIMER : "";
      // [현재 테마] — off frees the agent to commit to the content's own palette.
      const themeLine = s.sendTheme ? currentThemeLine() : "";
      // Per-request variation seed (DR-077 D3) — advance once per submit so the
      // same tone+text still differs run-to-run (drives free-axis sampling +
      // the temperature jitter below).
      variationSeedRef.current += 1;
      const variationSeed = variationSeedRef.current;
      // Design STYLE lever (DR-079) — the user picks a CATEGORY (미래지향 / SaaS / …);
      // we resolve a concrete style within it (글래스모피즘 / 오로라 / …), seeded so a
      // held category re-rolls each generation. With no pick and auto on, the agent
      // reads the content and picks the best-fit style itself (content-aware). A
      // per-request variation keeps WITHIN-style diversity. Off, or no pick with auto
      // off → no style block.
      const style = s.designTone ? resolveStyleSelection(styleId, variationSeed) : undefined;
      let styleLine = "";
      if (s.designTone) {
        if (style !== undefined) styleLine = composeStyleTask(style, variationSeed);
        else if (s.autoRotateTone) styleLine = autoStyleDirective(variationSeed);
      }
      // Aesthetic register for the picked style (DR-043 / DR-079) — sent so the design
      // server conditions its restraint policy on it. In AUTO mode the agent chooses
      // the style, so weave can't know it ahead → omit and let the server infer.
      const register = style?.register;
      // [테마 추천] — ask the agent to name a fitting theme in a parseable line
      // so the panel can offer one-click apply.
      const themeAdviceLine = s.themeAdvice
        ? `\n\n[테마 추천] 콘텐츠 무드에 가장 잘 맞는 테마를 하나 골라, 응답의 맨 끝에 정확히 \`추천 테마: <이름>\` 형식 한 줄로 적어주세요. 선택지: ${THEME_NAME_LIST}.`
        : "";
      // [스타일 레퍼런스] — the trailing N vision images are a style guide.
      const styleRefLines =
        styleRefImages.length > 0
          ? `\n\n[스타일 레퍼런스] 첨부된 마지막 ${styleRefImages.length}장은 스타일 참고용입니다 — 색감·톤·타이포·여백·레이아웃의 느낌만 모사하고, 그 이미지의 내용(텍스트/사물)을 그대로 옮기지는 마세요.`
          : "";
      // Intent block (WI-148): operation directive + tone/palette context, routed
      // from `intentPlan`. Empty for create / off / server-deferred → no-op.
      const intentBlock =
        intentPlan !== undefined
          ? composeIntentTask(intentPlan, depsRef.current.getDocument() as unknown as SigDocument)
          : "";
      const task = `${primer}${designLine}${themeLine}${styleLine}${themeAdviceLine}${assetLines}${styleRefLines}${selectionLine}${intentBlock}\n\n${text}`;
      const visionImages = styleRefImages.length > 0 ? [...images, ...styleRefImages] : images;

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
          // parses media-type + bytes into the model's first turn). Style-
          // reference images (when enabled) ride along after the content images.
          ...(visionImages.length > 0 ? { images: visionImages } : {}),
          // Per-request creativity → sampling temperature, jittered by the
          // variation seed so the same tone samples differently run-to-run
          // (DR-077 D3); server clamps 0..1.
          temperature: jitteredTemperature(s.creativity, variationSeed),
          ...(register !== undefined ? { register } : {}),
          // "server" mode: send the routed operation so the harness tunes its review
          // passes per intent (small-think WI-033). No-op unless the server enabled it.
          ...(wireIntent !== undefined ? { intent: wireIntent } : {}),
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
            // The server routed this turn to an edit operation (server mode, WI-033) —
            // reflect ITS choice on the chip (source of truth for what was applied; it may
            // have used a more accurate LLM classifier than the local heuristic). Gated on
            // the chip toggle; an unknown operation string is ignored (forward-compatible).
            if (event.type === "intent") {
              const op = event.operation;
              if (
                (depsRef.current.settings ?? DEFAULT_AKU_SETTINGS).showIntentChip &&
                (ALL_OPERATIONS as readonly string[]).includes(op)
              ) {
                patchLastAssistant((prev) => ({
                  ...prev,
                  intent: intentFromOperation(op as Operation, text, { hasSelection }),
                }));
              }
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
          // a confirmation when the turn was pure tool calls with no prose. `||`
          // (not `??`) so an EMPTY finalText also yields the confirmation — the
          // server blanks finalText in commands-only mode, which would otherwise
          // render a fully empty bubble.
          text:
            (succeeded
              ? prev.text !== ""
                ? prev.text
                : res.finalText || "완료했어요."
              : (res.error ?? "요청을 처리하지 못했어요.")) + truncatedNote,
          ...(succeeded ? {} : { error: true }),
          historyDepthAfter: depthAfter,
          undoEntryCount: Math.max(0, depthAfter - depthBefore),
        }));
        // WI-065 — the agent added top-level frame(s) → fit the camera to the new
        // content at the shared 70%, so an agent-built deck lands like every other
        // fit instead of staying at the base ~100% view. Gated on a frame-count
        // increase so pure edits don't yank the camera.
        if (
          succeeded &&
          s.autoFitCamera &&
          depsRef.current.getDocument().root.children.length > rootFramesBefore
        ) {
          depsRef.current.onFramesAdded?.();
        }
        // DEV — record a diversity signature from the generated document so the D6
        // harness (`window.__weaveDiversity.report()`) can score REAL cross-run
        // variety (DR-077 D6). Guarded + tree-shaken out of production.
        if (succeeded && import.meta.env.DEV) {
          collectDiversitySample(
            depsRef.current.getDocument() as unknown as SigDocument,
            depsRef.current.getDesignInfo?.()?.background,
            `${style?.id ?? "auto"}#${variationSeed}`,
          );
        }
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
    (
      text: string,
      images: ReadonlyArray<AkuImage> = [],
      opts?: {
        styleId?: string | null;
        styleRefImages?: ReadonlyArray<AkuImage>;
        intent?: IntentPlan;
        intentOp?: Operation;
      },
    ): void => {
      const trimmed = text.trim();
      if (trimmed === "" && images.length === 0) return;
      if (status === "streaming") return;
      void runTurn(trimmed, images, opts);
    },
    [runTurn, status],
  );

  const stop = useCallback((): void => {
    genRef.current += 1; // supersede the in-flight submit (ignore its late resolution)
    // Actually cancel the run server-side (small-think DR-011) — not just locally —
    // so the agent stops issuing further tool calls. Edits already committed stay
    // (the user undoes them via History); this only halts further ones.
    const id = activeTaskIdRef.current;
    if (id !== null) {
      handleRef.current?.cancel(id);
    } else if (resumedRef.current) {
      // WI-151 — a server-ADOPTED (resumed) run has no local task id; cancel it by the
      // server-reported job ids. queueStatus.jobs is GLOBAL (WI-035), so cancel only
      // OUR own jobs — foreign jobs are anonymized ("other:N") and must never be cancelled.
      for (const job of queueStatusRef.current?.jobs ?? []) {
        if (job.own) handleRef.current?.cancel(job.id);
      }
    }
    activeTaskIdRef.current = null;
    // WI-151 — the user took explicit control: stop owning any adopted run and
    // disable re-adoption (else the effect would re-light dim until the server
    // clears the just-cancelled job from queueStatus).
    resumedRef.current = false;
    engagedRef.current = true;
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

  /** Re-run the most recent user turn with a CORRECTED intent (chip edit, WI-148):
   *  drop the trailing assistant + that user msg, then resend with an explicit plan. */
  const correctIntent = useCallback(
    (plan: IntentPlan): void => {
      if (status === "streaming") return;
      const cur = messagesRef.current;
      let i = cur.length - 1;
      while (i >= 0 && cur[i]?.role === "assistant") i--;
      const userMsg = cur[i];
      if (userMsg === undefined || userMsg.role !== "user") return;
      commit(cur.slice(0, i));
      void runTurn(userMsg.text, userMsg.images ?? [], { intent: plan });
    },
    [commit, runTurn, status],
  );

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
    // WI-151 — explicit user action: drop any adopted run + disable re-adoption.
    resumedRef.current = false;
    engagedRef.current = true;
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
    setServerInfo(null); // stale once the link is dropped; re-announced on reconnect
    setQueueStatus(null); // ditto — re-pushed when the next session connects
  }, []);

  /** Cancel a specific server-side job by task id (queued or running) — WI-034 queue chip. */
  const cancelJob = useCallback((taskId: string): void => {
    handleRef.current?.cancel(taskId);
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
    serverInfo,
    queueStatus,
    cancelJob,
    pendingClarify,
    resolveClarify,
    send,
    stop,
    regenerate: rerunLast,
    correctIntent,
    editFrom,
    retry,
    clear,
    history,
    hasToken,
    setToken,
    resetToken,
  };
}
