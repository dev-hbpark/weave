// Aku conversation state + loop (WI-052).
//
// SRP: this hook owns transcript state and the send→stream→tool loop ONLY.
// It depends on the `AkuTransport` interface (Strategy) and an optional
// `AkuToolset` (design-aware capabilities) — never on a concrete transport or
// on `editor` directly. Tool-calls are dispatched by map lookup (Rule 6), and
// each executor applies its edit through `editor.exec` (undoable) inside the
// toolset, so this hook never mutates the document itself.

import { useCallback, useRef, useState } from "react";
import type { AkuToolset } from "./tools/types.js";
import type { AkuEditRecord, AkuImage, AkuMessage, AkuTransport } from "./transport/types.js";

export type AkuStatus = "idle" | "streaming";

export interface UseAkuConversation {
  readonly messages: ReadonlyArray<AkuMessage>;
  readonly status: AkuStatus;
  send(text: string, images?: ReadonlyArray<AkuImage>): void;
  stop(): void;
}

export function useAkuConversation(deps: {
  readonly transport: AkuTransport;
  readonly toolset?: AkuToolset;
}): UseAkuConversation {
  const { transport, toolset } = deps;
  const [messages, setMessages] = useState<ReadonlyArray<AkuMessage>>([]);
  const [status, setStatus] = useState<AkuStatus>("idle");
  const messagesRef = useRef<ReadonlyArray<AkuMessage>>([]);
  const abortRef = useRef<AbortController | null>(null);

  const commit = useCallback((next: ReadonlyArray<AkuMessage>): void => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const patchLastAssistant = useCallback(
    (patch: (m: Extract<AkuMessage, { role: "assistant" }>) => AkuMessage): void => {
      const prev = messagesRef.current;
      const last = prev[prev.length - 1];
      if (last === undefined || last.role !== "assistant") return;
      commit([...prev.slice(0, -1), patch(last)]);
    },
    [commit],
  );

  const send = useCallback(
    (text: string, images: ReadonlyArray<AkuImage> = []) => {
      const prompt = text.trim();
      if (prompt === "" && images.length === 0) return;

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const history = messagesRef.current;
      const userMsg: AkuMessage = {
        role: "user",
        text: prompt,
        ...(images.length > 0 ? { images } : {}),
      };
      commit([...history, userMsg, { role: "assistant", text: "" }]);
      setStatus("streaming");

      const run = async (): Promise<void> => {
        const snapshot = toolset?.snapshot();
        try {
          const stream = transport.send(
            { history, prompt, images, ...(snapshot !== undefined ? { snapshot } : {}) },
            ac.signal,
          );
          for await (const ev of stream) {
            if (ac.signal.aborted) break;
            if (ev.type === "text-delta") {
              patchLastAssistant((m) => ({ ...m, text: m.text + ev.text }));
            } else if (ev.type === "tool-call") {
              const exec = toolset?.executors.get(ev.call.name);
              const result = exec
                ? await exec(ev.call.input)
                : { ok: false, summary: `알 수 없는 도구: ${ev.call.name}` };
              const edit: AkuEditRecord = {
                tool: ev.call.name,
                summary: result.summary,
                ok: result.ok,
              };
              patchLastAssistant((m) => ({ ...m, edits: [...(m.edits ?? []), edit] }));
            } else if (ev.type === "error") {
              patchLastAssistant((m) => ({ ...m, text: `${m.text}\n[오류] ${ev.message}` }));
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          patchLastAssistant((m) => ({ ...m, text: `${m.text}\n[오류] ${message}` }));
        } finally {
          if (abortRef.current === ac) {
            abortRef.current = null;
            setStatus("idle");
          }
        }
      };
      void run();
    },
    [transport, toolset, commit, patchLastAssistant],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
  }, []);

  return { messages, status, send, stop };
}
