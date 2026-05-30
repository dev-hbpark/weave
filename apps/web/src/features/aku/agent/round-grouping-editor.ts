// 아쿠 (Aku) — group an agent's per-round tool calls into ONE undo entry (WI-060).
//
// The reverse-MCP agent loop dispatches a model round's tool calls SEQUENTIALLY
// over the network: each `editor.exec` lands in its own event-loop task,
// separated by a result round-trip, so a synchronous `editor.runBatch` cannot
// wrap them. Instead we use the editor's async-spanning transaction group
// (`beginBatch`/`endBatch`): the proxy below opens a group on the first exec and
// keeps it open while calls keep arriving, so every exec shares one
// transactionId → one Cmd+Z.
//
// Round boundary = an idle gap. Within a round, calls are back-to-back (one
// network round-trip apart, no model call between them). BETWEEN rounds the
// server must call the model again (seconds), so an idle window comfortably
// larger than a round-trip but far smaller than model latency closes the group
// at the true round boundary. `close()` force-closes on run end / stop / unmount
// so a group never outlives the agent run (which would let a later edit merge in).
//
// `exec` stays SYNCHRONOUS — we run it immediately and only bracket it with
// begin/end. Nothing is deferred, so there is no deadlock with the server's
// "await each tool result before issuing the next" loop.

import type { Editor } from "@agocraft/editor";

/** Idle gap (ms) that ends a round. Bigger than a tool-call network round-trip,
 *  far smaller than the model's between-round latency. */
export const ROUND_IDLE_MS = 700;

export interface RoundGroupingEditor {
  /** Proxy editor to hand to the agent bridge (`connectAgocraftAgent`). */
  readonly editor: Editor;
  /** Force-close any open group now. Call when the agent run ends / is stopped /
   *  the hook unmounts so the transaction group never spans past the run. */
  readonly close: () => void;
}

type ExecFn = (commandName: string, input: unknown, opts?: unknown) => unknown;

export function makeRoundGroupingEditor(
  editor: Editor,
  idleMs: number = ROUND_IDLE_MS,
): RoundGroupingEditor {
  let open = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const close = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (open) {
      editor.endBatch();
      open = false;
    }
  };

  // Register an exec into the current round: open the group if needed, then
  // (re)arm the idle timer that closes it once calls stop arriving.
  const touch = (): void => {
    if (!open) {
      editor.beginBatch();
      open = true;
    }
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(close, idleMs);
  };

  const proxiedExec: ExecFn = (commandName, input, opts) => {
    touch();
    // Run immediately and synchronously — the editor records this exec under the
    // open group's shared transactionId. No deferral → no deadlock.
    try {
      const result = (editor.exec as unknown as ExecFn)(commandName, input, opts);
      // DEV diagnostics (apps/web/CLAUDE.md): a failed command returns { ok:false,
      // error } (NOT a throw) — the bridge turns that into the tool's ok:false the
      // server sees. Log the command + input + error so "edits all fail" is debuggable.
      if (import.meta.env.DEV) {
        const failed =
          typeof result === "object" &&
          result !== null &&
          (result as { ok?: unknown }).ok === false;
        if (failed) {
          console.warn("[aku exec ✗]", commandName, {
            input,
            error: (result as { error?: unknown }).error,
          });
        } else {
          console.debug("[aku exec ✓]", commandName, input);
        }
      }
      return result;
    } catch (err) {
      if (import.meta.env.DEV) console.error("[aku exec ✗ threw]", commandName, { input, err });
      throw err;
    }
  };

  const proxy = new Proxy(editor, {
    get(target, prop, receiver) {
      if (prop === "exec") return proxiedExec;
      return Reflect.get(target, prop, receiver);
    },
  }) as Editor;

  return { editor: proxy, close };
}
