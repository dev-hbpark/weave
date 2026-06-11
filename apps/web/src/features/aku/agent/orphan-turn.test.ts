// WI-174 — pure half of the chat-panel reattach to a grace-replayed run.
// The hook wiring (refs + connect options) is pinned by
// use-aku-agent.orphan-bridge.test.ts; the decisions live here.

import { describe, expect, it } from "vitest";
import type { AkuAssistantMessage, AkuMessage } from "../types.js";
import {
  ADOPTED_ACTIVITY,
  finalizeOrphanResponse,
  mergeOrphanEdits,
  planAdoptedBubble,
  shouldHandleOrphanFrame,
} from "./orphan-turn.js";

describe("shouldHandleOrphanFrame (WI-174 gate)", () => {
  it("accepts on a fresh page session — frames can outrun the adopt push", () => {
    expect(shouldHandleOrphanFrame({ engaged: false, resumed: false })).toBe(true);
  });
  it("accepts while holding an adopted run", () => {
    expect(shouldHandleOrphanFrame({ engaged: true, resumed: true })).toBe(true);
    expect(shouldHandleOrphanFrame({ engaged: false, resumed: true })).toBe(true);
  });
  it("drops after stop/clear (WI-039's surviving late-ok frame)", () => {
    expect(shouldHandleOrphanFrame({ engaged: true, resumed: false })).toBe(false);
  });
});

describe("planAdoptedBubble", () => {
  const inFlight: AkuAssistantMessage = {
    role: "assistant",
    text: "절반쯤 진행한 프로즈",
    edits: [{ tool: "weave.item.add", summary: "아이템 추가", ok: true }],
    at: 1,
  };

  it("revives a trailing assistant bubble — keeps text/edits, sets the caption", () => {
    const plan = planAdoptedBubble(inFlight, 99);
    expect(plan.mode).toBe("revive");
    expect(plan.bubble.text).toBe(inFlight.text);
    expect(plan.bubble.edits).toEqual(inFlight.edits);
    expect(plan.bubble.activity).toBe(ADOPTED_ACTIVITY);
  });

  it("clears a stale error flag (the WI-171 transport-drop message) on revive", () => {
    const plan = planAdoptedBubble({ ...inFlight, error: true }, 99);
    expect(plan.bubble.error).toBeUndefined();
  });

  it("appends a fresh bubble when the transcript ends with a user message", () => {
    const user: AkuMessage = { role: "user", text: "만들어줘" };
    const plan = planAdoptedBubble(user, 42);
    expect(plan.mode).toBe("append");
    expect(plan.bubble).toMatchObject({
      role: "assistant",
      text: "",
      edits: [],
      at: 42,
      activity: ADOPTED_ACTIVITY,
    });
  });

  it("appends on an empty transcript", () => {
    expect(planAdoptedBubble(undefined, 7).mode).toBe("append");
  });
});

describe("mergeOrphanEdits", () => {
  it("keeps the pre-drop chips AHEAD of the replay's fold", () => {
    const base = [{ tool: "a", summary: "A", ok: true }];
    const merged = mergeOrphanEdits(
      base,
      [
        { name: "b", status: "ok" },
        { name: "c", status: "error" },
      ],
      (n) => n.toUpperCase(),
    );
    expect(merged).toEqual([
      { tool: "a", summary: "A", ok: true },
      { tool: "b", summary: "B", ok: true },
      { tool: "c", summary: "C", ok: false },
    ]);
  });
});

describe("finalizeOrphanResponse", () => {
  const prev: AkuAssistantMessage = { role: "assistant", text: "", activity: ADOPTED_ACTIVITY };

  it("keeps streamed prose when present", () => {
    const out = finalizeOrphanResponse({ ...prev, text: "스트리밍된 프로즈" }, { ok: true });
    expect(out.text).toBe("스트리밍된 프로즈");
  });

  it("falls back to finalText, then the commands-only confirmation (`||`, not `??`)", () => {
    expect(finalizeOrphanResponse(prev, { ok: true, finalText: "최종" }).text).toBe("최종");
    expect(finalizeOrphanResponse(prev, { ok: true, finalText: "" }).text).toBe("완료했어요.");
    expect(finalizeOrphanResponse(prev, { ok: true }).text).toBe("완료했어요.");
  });

  it("drops the live caption and clears a stale error flag on success", () => {
    const out = finalizeOrphanResponse({ ...prev, error: true }, { ok: true, finalText: "done" });
    expect(out.activity).toBeUndefined();
    expect(out.error).toBeUndefined();
  });

  it("surfaces a failure as the error text + flag (ok:true with error still fails)", () => {
    const failed = finalizeOrphanResponse(prev, { ok: false, error: "터졌어요" });
    expect(failed).toMatchObject({ text: "터졌어요", error: true });
    const okButError = finalizeOrphanResponse(prev, { ok: true, error: "부분 실패" });
    expect(okButError).toMatchObject({ text: "부분 실패", error: true });
    const noDetail = finalizeOrphanResponse(prev, { ok: false });
    expect(noDetail.text).toBe("요청을 처리하지 못했어요.");
  });
});
