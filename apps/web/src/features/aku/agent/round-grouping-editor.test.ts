// WI-060 — per-round agent undo grouping. Unit tests for the proxy editor with
// a fake editor + fake timers (no real editor / websocket needed).

import type { Editor } from "@agocraft/editor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRoundGroupingEditor, ROUND_IDLE_MS } from "./round-grouping-editor.js";

interface FakeState {
  begins: number;
  ends: number;
  /** Number of currently-open groups (begins − ends) at each exec. */
  readonly execDepths: number[];
  readonly execNames: string[];
}

function fakeEditor(): { editor: Editor; state: FakeState } {
  const state: FakeState = { begins: 0, ends: 0, execDepths: [], execNames: [] };
  let depth = 0;
  const editor = {
    beginBatch: () => {
      state.begins += 1;
      depth += 1;
    },
    endBatch: () => {
      state.ends += 1;
      if (depth > 0) depth -= 1;
    },
    exec: (name: string) => {
      state.execDepths.push(depth);
      state.execNames.push(name);
      return { ok: true, value: `${name}-r` };
    },
  } as unknown as Editor;
  return { editor, state };
}

describe("makeRoundGroupingEditor (WI-060)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("opens one group for a burst and closes it after the idle gap", () => {
    const { editor, state } = fakeEditor();
    const rg = makeRoundGroupingEditor(editor);
    rg.editor.exec("a", {});
    rg.editor.exec("b", {});
    rg.editor.exec("c", {});
    // All three ran inside ONE open group; not yet closed.
    expect(state.begins).toBe(1);
    expect(state.ends).toBe(0);
    expect(state.execDepths).toEqual([1, 1, 1]);
    // Idle gap elapses → group closes.
    vi.advanceTimersByTime(ROUND_IDLE_MS);
    expect(state.ends).toBe(1);
  });

  it("separates rounds: an idle gap between bursts → two groups", () => {
    const { editor, state } = fakeEditor();
    const rg = makeRoundGroupingEditor(editor);
    // Round 1
    rg.editor.exec("a", {});
    rg.editor.exec("b", {});
    vi.advanceTimersByTime(ROUND_IDLE_MS); // close round 1
    // Round 2
    rg.editor.exec("c", {});
    vi.advanceTimersByTime(ROUND_IDLE_MS); // close round 2
    expect(state.begins).toBe(2);
    expect(state.ends).toBe(2);
  });

  it("keeps the group open while calls keep arriving within the window", () => {
    const { editor, state } = fakeEditor();
    const rg = makeRoundGroupingEditor(editor, 100);
    rg.editor.exec("a", {});
    vi.advanceTimersByTime(60); // < window — timer re-armed by next call
    rg.editor.exec("b", {});
    vi.advanceTimersByTime(60);
    rg.editor.exec("c", {});
    expect(state.begins).toBe(1); // still one group
    expect(state.ends).toBe(0);
    vi.advanceTimersByTime(100); // now idle → close
    expect(state.ends).toBe(1);
  });

  it("close() force-closes an open group immediately and cancels the timer", () => {
    const { editor, state } = fakeEditor();
    const rg = makeRoundGroupingEditor(editor);
    rg.editor.exec("a", {});
    expect(state.begins).toBe(1);
    rg.close();
    expect(state.ends).toBe(1);
    // The pending idle timer must not fire a second endBatch.
    vi.advanceTimersByTime(ROUND_IDLE_MS * 2);
    expect(state.ends).toBe(1);
  });

  it("close() with no open group is a no-op", () => {
    const { editor, state } = fakeEditor();
    const rg = makeRoundGroupingEditor(editor);
    rg.close();
    expect(state.begins).toBe(0);
    expect(state.ends).toBe(0);
  });

  it("passes the exec result through unchanged", () => {
    const { editor } = fakeEditor();
    const rg = makeRoundGroupingEditor(editor);
    expect(rg.editor.exec("weave.item.add", {})).toEqual({ ok: true, value: "weave.item.add-r" });
  });
});
