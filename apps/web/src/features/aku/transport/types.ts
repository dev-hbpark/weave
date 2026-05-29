// 아쿠 (Aku) transport contract (WI-052).
//
// The seam that makes "mock now, real Claude later" a drop-in: the conversation
// hook depends only on `AkuTransport`, never on a concrete implementation. v1
// ships `createMockAkuTransport`; the real `createClaudeAkuTransport`
// (fetch /api/aku → parse stream → same events) implements the same interface.

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
}
export interface AkuAssistantMessage {
  readonly role: "assistant";
  readonly text: string;
  /** Edits applied during this turn (rendered as action chips). */
  readonly edits?: ReadonlyArray<AkuEditRecord>;
}
export type AkuMessage = AkuUserMessage | AkuAssistantMessage;

/** A read-only snapshot of the canvas Aku is reasoning about (design-aware). */
export interface AkuDocItemSnapshot {
  readonly id: string;
  readonly kind: string;
  readonly text?: string;
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

/** Events streamed back from the transport, in order. */
export type AkuEvent =
  | { readonly type: "text-delta"; readonly text: string }
  | { readonly type: "tool-call"; readonly call: AkuToolCall }
  | { readonly type: "done" }
  | { readonly type: "error"; readonly message: string };

export interface AkuRequest {
  /** Prior turns (excluding the one being sent). */
  readonly history: ReadonlyArray<AkuMessage>;
  readonly prompt: string;
  readonly images: ReadonlyArray<AkuImage>;
  /** Current canvas snapshot (design-aware context); omitted when no tools. */
  readonly snapshot?: AkuDocSnapshot;
}

/** Strategy seam. `send` yields an ordered async stream of events; honoring
 *  `signal` lets the UI cancel (Stop) mid-stream. */
export interface AkuTransport {
  send(req: AkuRequest, signal: AbortSignal): AsyncIterable<AkuEvent>;
}
