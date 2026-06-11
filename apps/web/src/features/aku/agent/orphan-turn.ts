// 아쿠 (Aku) — orphan-frame chat reattach (WI-174).
//
// PROBLEM: after a refresh the server grace-replays the interrupted run
// (WI-034) and streams its progress + final response to the reconnected
// client — but the client's pending map died with the old page, so
// @small-think/client used to DROP every frame. Dim + roaming recover via
// the queue own-job adopt path (WI-151 / agent-resume.ts); the chat panel
// had nothing to re-attach to. small-think WI-041 added orphan hooks
// (`onOrphanEvent` / `onOrphanResponse`, forwarded by agocraft WI-038);
// this module is the PURE half of weave's consumption — the bubble plan,
// the finalize merge, and the frame gate — unit-tested without a renderHook.
//
// LIFECYCLE (wired in use-aku-agent.ts):
//   adopt / first orphan frame → planAdoptedBubble (revive the trailing
//   assistant bubble — the persisted transcript ends with the in-flight
//   turn's bubble — or append a fresh one) → orphan events fold through
//   reduceAgentState into a caption + chips → the orphan response (or the
//   WI-151 release) finalizes the text and clears the caption.

import type { AkuAssistantMessage, AkuEditRecord, AkuMessage } from "../types.js";

/** Caption shown on the adopted bubble until the replayed run's own events
 *  take over ("생각 중…" / "○○ 적용 중…"). */
export const ADOPTED_ACTIVITY = "이어서 작업 중…";

/** Gate for an orphan frame. Engaged-without-adoption means the LOCAL run
 *  lifecycle (or an explicit stop/clear) owns the session — a late frame
 *  there is the WI-039 case: a locally-cancelled run whose server-side
 *  completion still delivered its ok frame. Drop it. A fresh page session
 *  (not engaged) accepts frames even BEFORE the queue push triggers the
 *  adopt — replay frames can outrun the queue snapshot. */
export function shouldHandleOrphanFrame(flags: {
  readonly engaged: boolean;
  readonly resumed: boolean;
}): boolean {
  return !(flags.engaged && !flags.resumed);
}

export interface OrphanBubblePlan {
  /** "revive" replaces the trailing assistant message; "append" adds one. */
  readonly mode: "revive" | "append";
  readonly bubble: AkuAssistantMessage;
}

/** Build the adopted run's bubble. The persisted transcript normally ends
 *  with the interrupted turn's assistant bubble (runTurn commits user +
 *  assistant together; `lighten()` already stripped its live caption), so
 *  REVIVE it — set the caption, clear a stale error flag (the WI-171
 *  transport-drop message marks the bubble `error: true`, but the run is
 *  alive again). No trailing assistant (history off / cleared) → append. */
export function planAdoptedBubble(last: AkuMessage | undefined, now: number): OrphanBubblePlan {
  if (last !== undefined && last.role === "assistant") {
    const { error: _error, ...rest } = last;
    return { mode: "revive", bubble: { ...rest, activity: ADOPTED_ACTIVITY } };
  }
  return {
    mode: "append",
    bubble: { role: "assistant", text: "", edits: [], at: now, activity: ADOPTED_ACTIVITY },
  };
}

/** Merge the replayed run's streamed tool chips AFTER the bubble's pre-drop
 *  chips (the persisted edits describe the same logical turn's earlier
 *  edits — never overwrite them with the replay's fresh fold). */
export function mergeOrphanEdits(
  baseEdits: ReadonlyArray<AkuEditRecord>,
  activeTools: ReadonlyArray<{ readonly name: string; readonly status: string }>,
  label: (toolName: string) => string,
): ReadonlyArray<AkuEditRecord> {
  return [
    ...baseEdits,
    ...activeTools.map((t) => ({ tool: t.name, summary: label(t.name), ok: t.status !== "error" })),
  ];
}

/** Finalize the adopted bubble from the orphan FINAL response — mirrors
 *  runTurn's response merge: keep streamed prose when present, else
 *  finalText, else the commands-only confirmation (`||` so an EMPTY
 *  finalText also confirms); failures surface the error text + flag. The
 *  live caption is dropped (turn settled), and a success clears any stale
 *  error flag left by the transport-drop message. */
export function finalizeOrphanResponse(
  prev: AkuAssistantMessage,
  res: { readonly ok: boolean; readonly error?: string; readonly finalText?: string },
): AkuAssistantMessage {
  const succeeded = res.ok && res.error === undefined;
  const { activity: _activity, error: _error, ...rest } = prev;
  return {
    ...rest,
    text: succeeded
      ? prev.text !== ""
        ? prev.text
        : res.finalText || "완료했어요."
      : (res.error ?? "요청을 처리하지 못했어요."),
    ...(succeeded ? {} : { error: true }),
  };
}
