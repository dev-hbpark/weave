// 아쿠 (Aku) UI types (WI-054). The transcript + composer model, decoupled from
// any transport. Before WI-054 these lived in `transport/types.ts` alongside the
// (now removed) mock/SSE transport contract and the client-side agentic loop.
// The reverse-MCP rewrite (DR-009, @agocraft/agent-client) moved the agent loop
// to the small-think server, so the only types that survive are the ones the
// panel UI renders.

import type { IntentPlan } from "./agent/intent/types.js";

/** An image attached to a user turn (data URL — base64 inline). */
export interface AkuImage {
  readonly dataUrl: string;
  readonly name?: string;
}

/** A canvas edit Aku applied during a turn (one per executed tool-call). The
 *  server streams a `tool` event per call; the hook turns each into a chip. */
export interface AkuEditRecord {
  readonly tool: string;
  readonly summary: string;
  readonly ok: boolean;
}

export interface AkuUserMessage {
  readonly role: "user";
  readonly text: string;
  readonly images?: ReadonlyArray<AkuImage>;
  /** Epoch ms when the turn was sent (for timestamps). */
  readonly at?: number;
}

/** Per-task token/cost total the server streams right before the turn settles
 *  (small-think DR-058 `cost` event — exactly one per task, covering EVERY model
 *  turn of the build + review pipeline). `costUsd` is an estimate in api mode
 *  (public list prices) and SDK-authoritative in byo-ssh; absent when the model
 *  family is unknown to the server's pricing table (tokens-only, no guessed
 *  dollars). Durable — survives persistence (a turn's cost doesn't expire). */
export interface AkuCostRecord {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly costUsd?: number;
  /** Subscription rate-limit windows at the END of the task (small-think DR-059 —
   *  byo-ssh only; api mode bills per token and never reports windows). Snapshot of
   *  how full each window is NOW (other sessions burn the same windows), not "what
   *  this task consumed". `utilization` is a 0–1 fraction. */
  readonly limits?: ReadonlyArray<AkuLimitWindow>;
}

/** One subscription window snapshot (server passes the SDK's window id through
 *  verbatim: "five_hour", "seven_day", "seven_day_opus", …). */
export interface AkuLimitWindow {
  readonly window: string;
  readonly utilization: number;
  /** Unix epoch SECONDS when the window resets, when known. */
  readonly resetsAt?: number;
  /** 이 태스크가 소모한 윈도우 비율 0–1 (small-think WI-047). 서버가 깨끗하게
   *  귀속할 수 있을 때만 존재 — 단독 실행 + 윈도우 무(無)리셋. 동시 태스크가
   *  돌았으면 부재(계정 전체 수치라 섞임). 부재 ≠ 0. */
  readonly taskDelta?: number;
}

export interface AkuAssistantMessage {
  readonly role: "assistant";
  readonly text: string;
  /** Edits applied during this turn (rendered as action chips). */
  readonly edits?: ReadonlyArray<AkuEditRecord>;
  /** Epoch ms when the turn started. */
  readonly at?: number;
  /** Server-reported failure (renders an error bubble + retry). */
  readonly error?: boolean;
  /** Undo-stack depth right after this turn's edits were applied, and the
   *  number of undo entries the turn added. Live-session only (the undo stack
   *  resets on reload) — stripped before persistence, so a turn-level
   *  "이 변경 되돌리기" is offered only while the edits are still on top. */
  readonly historyDepthAfter?: number;
  readonly undoEntryCount?: number;
  /** Live progress caption while the turn is streaming (e.g. "생각 중…",
   *  "편집 적용 중: 배경색 변경"). Set from streamed agent events, cleared when
   *  the turn settles. Live-session only — stripped before persistence. */
  readonly activity?: string;
  /** The editing intent routed for this turn (WI-148). Set when intent routing is
   *  active (intentSource !== "off"); drives the correctable intent chip. */
  readonly intent?: IntentPlan;
  /** The turn's total token/dollar usage (WI-176) — set when the server streams
   *  its per-task `cost` event; renders as a footer line under the bubble. */
  readonly cost?: AkuCostRecord;
}

export type AkuMessage = AkuUserMessage | AkuAssistantMessage;

/** Conversation lifecycle. `streaming` = a submit is in flight (caret + Stop). */
export type AkuStatus = "idle" | "streaming";

/** The reverse-MCP connection surfaced to the panel (small-think DR-010). Orthogonal
 *  to AkuStatus (which tracks a single turn). `banner` is a Korean caption shown only
 *  when the connection needs attention (reconnecting / failed), else null when healthy. */
export interface AkuConnection {
  readonly state: "idle" | "connecting" | "open" | "reconnecting" | "closed" | "error";
  readonly banner: string | null;
}

/** A user turn reloaded into the composer for editing. */
export interface AkuDraft {
  readonly text: string;
  readonly images: ReadonlyArray<AkuImage>;
}

/** Thin window onto the editor's linear undo stack, so the transcript can
 *  measure how many entries a turn added and offer a turn-level
 *  "이 변경 되돌리기" while those edits are still on top of the stack.
 *  Backed by `editor.history` (depth = undoSize). */
export interface AkuHistoryController {
  /** Current undo-stack depth (number of undoable transactions). */
  depth(): number;
  /** Roll back up to `times` transactions (stops early if the stack empties). */
  undo(times: number): void;
}
