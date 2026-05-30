// 아쿠 (Aku) UI types (WI-054). The transcript + composer model, decoupled from
// any transport. Before WI-054 these lived in `transport/types.ts` alongside the
// (now removed) mock/SSE transport contract and the client-side agentic loop.
// The reverse-MCP rewrite (DR-009, @agocraft/agent-client) moved the agent loop
// to the small-think server, so the only types that survive are the ones the
// panel UI renders.

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
