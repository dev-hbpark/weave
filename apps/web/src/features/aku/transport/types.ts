// 아쿠 (Aku) transport contract (WI-052 → WI-053).
//
// The seam that makes "mock now, real Claude later" a drop-in: the conversation
// hook depends only on `AkuTransport`, never on a concrete implementation. The
// mock and the real Claude route (fetch /api/aku → parse SSE → same events)
// implement the same interface and consume the same `turns` wire history.
//
// WI-053: the request carries a provider-neutral `turns` history (text / image /
// tool_use / tool_result blocks) so the real transport can reconstruct Anthropic
// message blocks across an agentic loop, and `done` carries a `reason` so the
// hook knows whether to bounce (tool_use) or stop (end_turn).

/** An image attached to a user turn (data URL — base64 inline). */
export interface AkuImage {
  readonly dataUrl: string;
  readonly name?: string;
}

/** A canvas edit Aku applied during a turn (one per executed tool-call). */
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
  /** Transport-reported failure (renders an error bubble + retry). */
  readonly error?: boolean;
  /** History undo-stack depth right after this turn's edits were applied, and
   *  the number of undo entries the turn added. Live-session only (the undo
   *  stack resets on reload) — stripped before persistence, so a turn-level
   *  "이 변경 되돌리기" is offered only while the edits are still on top. */
  readonly historyDepthAfter?: number;
  readonly undoEntryCount?: number;
}
export type AkuMessage = AkuUserMessage | AkuAssistantMessage;

/** A read-only snapshot of the canvas Aku is reasoning about (design-aware). */
export interface AkuDocItemSnapshot {
  readonly id: string;
  readonly kind: string;
  readonly text?: string;
  /** Outer frame box (design px) when present. */
  readonly frame?: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
  readonly fill?: string;
  readonly layout?: string;
  /** Child ids, for frames/containers (so Aku understands nesting). */
  readonly childIds?: ReadonlyArray<string>;
}
export interface AkuDocSnapshot {
  readonly background?: string | null;
  readonly items: ReadonlyArray<AkuDocItemSnapshot>;
  readonly selectedIds: ReadonlyArray<string>;
}

/** A tool the agent may invoke; resolves to a `weave.*` command via the registry. */
export interface AkuToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

/** Events streamed back from the transport, in order. `done.reason` tells the
 *  hook whether the model wants to call tools (bounce + continue) or is finished. */
export type AkuEvent =
  | { readonly type: "text-delta"; readonly text: string }
  | { readonly type: "tool-call"; readonly call: AkuToolCall }
  | { readonly type: "done"; readonly reason: "end_turn" | "tool_use" }
  | { readonly type: "error"; readonly message: string };

// ─── Provider-neutral wire history ──────────────────────────────────────────
// The hook maintains this alongside the UI `messages`; the real transport maps
// it to Anthropic content blocks. The mock reads only the latest user text.

export type AkuContentBlock =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly dataUrl: string }
  | {
      readonly type: "tool_use";
      readonly id: string;
      readonly name: string;
      readonly input: unknown;
    }
  | {
      readonly type: "tool_result";
      readonly toolUseId: string;
      readonly content: string;
      readonly isError?: boolean;
    };

export interface AkuTurn {
  readonly role: "user" | "assistant";
  readonly blocks: ReadonlyArray<AkuContentBlock>;
}

export interface AkuRequest {
  /** Full provider-neutral conversation so far (including this user turn and any
   *  prior tool_use/tool_result blocks from the in-flight agentic loop). */
  readonly turns: ReadonlyArray<AkuTurn>;
  /** Current canvas snapshot (design-aware context). */
  readonly snapshot?: AkuDocSnapshot;
  /** Shared passphrase gating the real route (never an API key). */
  readonly passphrase?: string;
}

/** Strategy seam. `send` yields an ordered async stream of events for ONE model
 *  turn; honoring `signal` lets the UI cancel (Stop) mid-stream. */
export interface AkuTransport {
  send(req: AkuRequest, signal: AbortSignal): AsyncIterable<AkuEvent>;
}

/** Extract the most recent user turn's plain text (mock convenience). */
export function latestUserText(turns: ReadonlyArray<AkuTurn>): string {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (t === undefined || t.role !== "user") continue;
    const text = t.blocks
      .filter((b): b is Extract<AkuContentBlock, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (text !== "") return text;
    // a user turn made of tool_result blocks only — keep scanning back.
  }
  return "";
}
