// Mock Aku transport (WI-052) — streams a scripted reply token-by-token and,
// for recognized edit intents, emits a tool-call so the design-aware wire is
// exercised end-to-end without a real model. The event shape is identical to
// the future Claude transport, so swapping is a drop-in.
//
// DEV/personal only: there is no LLM here. Intent matching is deliberately
// shallow (keyword heuristics) — just enough to demonstrate read + edit.

import {
  type AkuEvent,
  type AkuRequest,
  type AkuToolCall,
  type AkuTransport,
  latestUserText,
} from "./types.js";

const STREAM_DELAY_MS = 26;

let callSeq = 0;
function nextCallId(): string {
  callSeq += 1;
  return `mock-call-${callSeq}`;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Split into stream chunks that keep words/spaces intact (CJK-friendly: emits
 *  per character, which reads naturally for Korean). */
function chunk(text: string): string[] {
  return Array.from(text);
}

const COLOR_WORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/파랑|파란|블루|blue/i, "#3b82f6"],
  [/빨강|빨간|레드|red/i, "#ef4444"],
  [/초록|녹색|그린|green/i, "#22c55e"],
  [/노랑|노란|옐로|yellow/i, "#eab308"],
  [/검정|검은|블랙|black/i, "#0f172a"],
  [/하양|하얀|흰|화이트|white/i, "#ffffff"],
  [/보라|퍼플|purple/i, "#8b5cf6"],
];

/** Shallow intent → optional tool-call + reply text. The real model decides
 *  this; the mock fakes it from keywords so the canvas wire can be tested. */
function script(prompt: string): { readonly reply: string; readonly call?: AkuToolCall } {
  const p = prompt.trim();

  // 배경색 변경
  if (/배경|background|bg\b/i.test(p)) {
    const hit = COLOR_WORDS.find(([re]) => re.test(p));
    if (hit !== undefined) {
      return {
        reply: `배경색을 바꿔 드릴게요.`,
        call: { id: nextCallId(), name: "setBackground", input: { color: hit[1] } },
      };
    }
  }

  // 텍스트/도형/이미지/프레임 추가
  const addKind = /텍스트|글자|text/i.test(p)
    ? "text"
    : /도형|모양|shape/i.test(p)
      ? "shape"
      : /이미지|사진|image/i.test(p)
        ? "image"
        : /프레임|frame|슬라이드 영역/i.test(p)
          ? "frame"
          : undefined;
  if (addKind !== undefined && /추가|넣어|만들어|add|insert/i.test(p)) {
    return {
      reply: `${addKind} 아이템을 추가할게요.`,
      call: { id: nextCallId(), name: "addItem", input: { kind: addKind } },
    };
  }

  // 슬라이드 프리셋
  if (/슬라이드|slide/i.test(p) && /추가|만들|넣|add|insert/i.test(p)) {
    return {
      reply: `커버 슬라이드를 하나 추가할게요.`,
      call: { id: nextCallId(), name: "insertSlidePreset", input: { presetId: "cover.bold" } },
    };
  }

  // 일반 대화 (편집 의도 없음)
  return {
    reply:
      "안녕하세요, 아쿠예요. 캔버스 작업을 도와드릴 수 있어요. " +
      '예: "배경을 파랑으로 바꿔줘", "텍스트 추가해줘", "커버 슬라이드 추가" 처럼 말씀해 주세요.',
  };
}

export function createMockAkuTransport(): AkuTransport {
  return {
    async *send(req: AkuRequest, signal: AbortSignal): AsyncIterable<AkuEvent> {
      const { reply, call } = script(latestUserText(req.turns));
      for (const tok of chunk(reply)) {
        if (signal.aborted) return;
        await delay(STREAM_DELAY_MS);
        if (signal.aborted) return;
        yield { type: "text-delta", text: tok };
      }
      if (call !== undefined && !signal.aborted) {
        yield { type: "tool-call", call };
      }
      // The mock applies its (single) edit within one turn — it never bounces,
      // so `end_turn` even when a tool-call was emitted. The real Claude
      // transport drives `tool_use` continuations.
      yield { type: "done", reason: "end_turn" };
    },
  };
}
