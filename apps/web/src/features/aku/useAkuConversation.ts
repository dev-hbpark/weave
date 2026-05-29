// Aku conversation state + agentic loop (WI-052 → WI-053).
//
// SRP: this hook owns transcript state and the send→stream→tool loop ONLY. It
// depends on the `AkuTransport` interface (Strategy) and an optional `AkuToolset`
// (design-aware capabilities) — never on a concrete transport or on `editor`
// directly. Tool-calls dispatch by map lookup (Rule 6); each executor applies
// its edit through `editor.exec` (undoable) inside the toolset, so this hook
// never mutates the document itself.
//
// WI-053 — the loop is now multi-turn (agentic): a single `send` may span several
// model turns. The hook keeps a provider-neutral `turns` wire (text / image /
// tool_use / tool_result blocks) alongside the UI `messages`; when a turn ends
// with `reason==="tool_use"` it executes the tools, appends the results as a user
// turn, and re-invokes the transport until `end_turn`. The mock never bounces
// (single `end_turn` turn), so its behavior is unchanged. Also: regenerate /
// editFrom / retry / clear, and per-design persistence.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearConversation,
  loadConversation,
  persistConversation,
} from "./conversation-storage.js";
import type { AkuHistoryController, AkuToolset } from "./tools/types.js";
import type {
  AkuContentBlock,
  AkuImage,
  AkuMessage,
  AkuToolCall,
  AkuTransport,
  AkuTurn,
} from "./transport/types.js";

export type AkuStatus = "idle" | "streaming";

/** Hard cap on agentic bounces within one `send`, so a misbehaving model can
 *  never loop forever applying tools. */
const MAX_AGENTIC_TURNS = 8;

export interface AkuDraft {
  readonly text: string;
  readonly images: ReadonlyArray<AkuImage>;
}

export interface UseAkuConversation {
  readonly messages: ReadonlyArray<AkuMessage>;
  readonly status: AkuStatus;
  send(text: string, images?: ReadonlyArray<AkuImage>): void;
  stop(): void;
  /** Re-run the most recent user turn (drops its response first). */
  regenerate(): void;
  /** Roll the transcript back to before the user message at `index` and return
   *  its content so the composer can reload it for editing. */
  editFrom(index: number): AkuDraft | null;
  /** Re-run the last user turn after a transport error. */
  retry(): void;
  /** Wipe the transcript (and its persisted copy). */
  clear(): void;
  /** Undo controller for turn-level "이 변경 되돌리기" (live session only). */
  readonly history: AkuHistoryController | undefined;
}

/** One user send: text + images + the transcript/wire lengths captured *before*
 *  it was appended, so regenerate/editFrom can roll back precisely. */
interface SendRecord {
  readonly text: string;
  readonly images: ReadonlyArray<AkuImage>;
  readonly uiLen: number;
  readonly wireLen: number;
}

function userBlocks(text: string, images: ReadonlyArray<AkuImage>): AkuContentBlock[] {
  const blocks: AkuContentBlock[] = [];
  if (text !== "") blocks.push({ type: "text", text });
  for (const img of images) blocks.push({ type: "image", dataUrl: img.dataUrl });
  return blocks;
}

/** Rebuild the wire + send-records from a restored transcript. The wire is
 *  text-only for assistant turns (tool_use/tool_result blocks aren't persisted),
 *  which is fine: the undo stack is gone after reload, and the model still sees
 *  the conversational context. Boundaries stay internally consistent so
 *  regenerate/editFrom keep working. */
function rebuild(messages: ReadonlyArray<AkuMessage>): {
  turns: AkuTurn[];
  sends: SendRecord[];
} {
  const turns: AkuTurn[] = [];
  const sends: SendRecord[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m === undefined) continue;
    if (m.role === "user") {
      sends.push({ text: m.text, images: m.images ?? [], uiLen: i, wireLen: turns.length });
      turns.push({ role: "user", blocks: userBlocks(m.text, m.images ?? []) });
    } else if (m.text.trim() !== "") {
      turns.push({ role: "assistant", blocks: [{ type: "text", text: m.text }] });
    }
  }
  return { turns, sends };
}

export function useAkuConversation(deps: {
  readonly transport: AkuTransport;
  readonly toolset?: AkuToolset;
  readonly designId?: string;
  readonly getPassphrase?: () => string | undefined;
}): UseAkuConversation {
  const { transport, toolset, designId = "", getPassphrase } = deps;

  const [messages, setMessages] = useState<ReadonlyArray<AkuMessage>>([]);
  const [status, setStatus] = useState<AkuStatus>("idle");
  const messagesRef = useRef<ReadonlyArray<AkuMessage>>([]);
  const turnsRef = useRef<ReadonlyArray<AkuTurn>>([]);
  const sendsRef = useRef<ReadonlyArray<SendRecord>>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Keep deps in refs so the stable callbacks always read the latest.
  const transportRef = useRef(transport);
  transportRef.current = transport;
  const toolsetRef = useRef(toolset);
  toolsetRef.current = toolset;
  const passRef = useRef(getPassphrase);
  passRef.current = getPassphrase;

  const commit = useCallback((next: ReadonlyArray<AkuMessage>): void => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  // ── Restore + persist per design ──────────────────────────────────────────
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (hydratedFor.current === designId) return;
    hydratedFor.current = designId;
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    const restored = loadConversation(designId);
    const { turns, sends } = rebuild(restored);
    turnsRef.current = turns;
    sendsRef.current = sends;
    commit(restored);
  }, [designId, commit]);

  useEffect(() => {
    // Skip the initial empty write before hydration has run.
    if (hydratedFor.current !== designId) return;
    persistConversation(designId, messages);
  }, [messages, designId]);

  const patchLastAssistant = useCallback(
    (patch: (m: Extract<AkuMessage, { role: "assistant" }>) => AkuMessage): void => {
      const prev = messagesRef.current;
      const last = prev[prev.length - 1];
      if (last === undefined || last.role !== "assistant") return;
      commit([...prev.slice(0, -1), patch(last)]);
    },
    [commit],
  );

  const lastAssistantText = useCallback((): string => {
    const last = messagesRef.current[messagesRef.current.length - 1];
    return last !== undefined && last.role === "assistant" ? last.text : "";
  }, []);

  const runLoop = useCallback(
    async (ac: AbortController): Promise<void> => {
      try {
        let guard = 0;
        while (!ac.signal.aborted && guard < MAX_AGENTIC_TURNS) {
          guard++;
          const tools = toolsetRef.current;
          const snapshot = tools?.snapshot();
          const depthBefore = tools?.history.depth() ?? 0;
          const passphrase = passRef.current?.();
          const calls: AkuToolCall[] = [];
          let reason: "end_turn" | "tool_use" = "end_turn";
          let errored = false;

          const stream = transportRef.current.send(
            {
              turns: turnsRef.current,
              ...(snapshot !== undefined ? { snapshot } : {}),
              ...(passphrase !== undefined && passphrase !== "" ? { passphrase } : {}),
            },
            ac.signal,
          );
          for await (const ev of stream) {
            if (ac.signal.aborted) break;
            if (ev.type === "text-delta") {
              patchLastAssistant((m) => ({ ...m, text: m.text + ev.text }));
            } else if (ev.type === "tool-call") {
              calls.push(ev.call);
            } else if (ev.type === "done") {
              reason = ev.reason;
            } else if (ev.type === "error") {
              errored = true;
              patchLastAssistant((m) => ({
                ...m,
                text: m.text === "" ? `[오류] ${ev.message}` : `${m.text}\n[오류] ${ev.message}`,
                error: true,
              }));
            }
          }
          if (ac.signal.aborted || errored) break;

          // Record this assistant turn (text + any tool_use) in the wire.
          const text = lastAssistantText();
          const toolUseBlocks: AkuContentBlock[] = calls.map((c) => ({
            type: "tool_use",
            id: c.id,
            name: c.name,
            input: c.input,
          }));
          turnsRef.current = [
            ...turnsRef.current,
            { role: "assistant", blocks: [{ type: "text", text }, ...toolUseBlocks] },
          ];

          if (calls.length === 0) break;

          // Execute tools client-side (undoable via editor.exec inside the toolset).
          const resultBlocks: AkuContentBlock[] = [];
          for (const call of calls) {
            const exec = tools?.executors.get(call.name);
            const res = exec
              ? await exec(call.input)
              : { ok: false, summary: `알 수 없는 도구: ${call.name}` };
            patchLastAssistant((m) => ({
              ...m,
              edits: [...(m.edits ?? []), { tool: call.name, summary: res.summary, ok: res.ok }],
            }));
            resultBlocks.push({
              type: "tool_result",
              toolUseId: call.id,
              content: res.summary,
              ...(res.ok ? {} : { isError: true }),
            });
          }
          const depthAfter = tools?.history.depth() ?? depthBefore;
          patchLastAssistant((m) => ({
            ...m,
            historyDepthAfter: depthAfter,
            undoEntryCount: Math.max(0, depthAfter - depthBefore),
          }));

          if (reason !== "tool_use" || ac.signal.aborted) break;

          // Feed results back as a user turn, open a fresh assistant bubble, loop.
          turnsRef.current = [...turnsRef.current, { role: "user", blocks: resultBlocks }];
          commit([...messagesRef.current, { role: "assistant", text: "", at: now() }]);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        patchLastAssistant((m) => ({
          ...m,
          text: m.text === "" ? `[오류] ${message}` : `${m.text}\n[오류] ${message}`,
          error: true,
        }));
      } finally {
        if (abortRef.current === ac) {
          abortRef.current = null;
          setStatus("idle");
        }
      }
    },
    [commit, patchLastAssistant, lastAssistantText],
  );

  const runSend = useCallback(
    (record: SendRecord): void => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const at = now();
      turnsRef.current = [
        ...turnsRef.current,
        { role: "user", blocks: userBlocks(record.text, record.images) },
      ];
      const userMsg: AkuMessage = {
        role: "user",
        text: record.text,
        at,
        ...(record.images.length > 0 ? { images: record.images } : {}),
      };
      commit([...messagesRef.current, userMsg, { role: "assistant", text: "", at }]);
      setStatus("streaming");
      void runLoop(ac);
    },
    [commit, runLoop],
  );

  const send = useCallback(
    (text: string, images: ReadonlyArray<AkuImage> = []): void => {
      const prompt = text.trim();
      if (prompt === "" && images.length === 0) return;
      const record: SendRecord = {
        text: prompt,
        images,
        uiLen: messagesRef.current.length,
        wireLen: turnsRef.current.length,
      };
      sendsRef.current = [...sendsRef.current, record];
      runSend(record);
    },
    [runSend],
  );

  const rollbackToSend = useCallback(
    (k: number): SendRecord | null => {
      const sends = sendsRef.current;
      const record = sends[k];
      if (record === undefined) return null;
      abortRef.current?.abort();
      abortRef.current = null;
      setStatus("idle");
      turnsRef.current = turnsRef.current.slice(0, record.wireLen);
      sendsRef.current = sends.slice(0, k);
      commit(messagesRef.current.slice(0, record.uiLen));
      return record;
    },
    [commit],
  );

  const regenerate = useCallback((): void => {
    const k = sendsRef.current.length - 1;
    if (k < 0) return;
    const record = rollbackToSend(k);
    if (record === null) return;
    send(record.text, record.images);
  }, [rollbackToSend, send]);

  const retry = regenerate;

  const editFrom = useCallback(
    (index: number): AkuDraft | null => {
      const k = sendsRef.current.findIndex((s) => s.uiLen === index);
      if (k < 0) return null;
      const record = rollbackToSend(k);
      if (record === null) return null;
      return { text: record.text, images: record.images };
    },
    [rollbackToSend],
  );

  const stop = useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
  }, []);

  const clear = useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    turnsRef.current = [];
    sendsRef.current = [];
    setStatus("idle");
    commit([]);
    clearConversation(designId);
  }, [commit, designId]);

  return {
    messages,
    status,
    send,
    stop,
    regenerate,
    editFrom,
    retry,
    clear,
    history: toolset?.history,
  };
}

/** Wall-clock for timestamps; isolated so the rule against bare Date.now in
 *  workflow scripts is moot here (this is app runtime, not a workflow). */
function now(): number {
  return Date.now();
}
