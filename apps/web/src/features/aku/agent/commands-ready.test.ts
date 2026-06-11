// WI-168 follow-up — waitForRegisteredCommands: the connect path must never
// freeze an EMPTY tool surface into the bridge (createCommandTools reads the
// command list ONCE at connect; an empty read leaves the agent with zero edit
// tools for the connection's whole lifetime — the ToolSearch-loop / all-edits-
// fail regression). Fake timers; no real editor.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitForRegisteredCommands } from "./use-aku-agent.js";

describe("waitForRegisteredCommands (WI-168 follow-up)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves immediately when commands are already registered (submit path)", async () => {
    let polls = 0;
    const commands = {
      list: () => {
        polls += 1;
        return ["weave.item.add"];
      },
    };
    const p = waitForRegisteredCommands(commands);
    await expect(p).resolves.toBeUndefined();
    expect(polls).toBe(1); // first check passes — no timer ever armed
  });

  it("waits through the empty mount-commit window until registration lands", async () => {
    // Models the real race: connect-on-init runs in the mount commit (child
    // effect), registration (parent effect) lands in the same flush — i.e.
    // before the first poll tick fires.
    let registered: ReadonlyArray<string> = [];
    const commands = { list: () => registered };
    let resolved = false;
    void waitForRegisteredCommands(commands, { pollMs: 10 }).then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(5);
    expect(resolved).toBe(false); // still empty — must not connect yet
    registered = ["weave.item.add"];
    await vi.advanceTimersByTimeAsync(10);
    expect(resolved).toBe(true);
  });

  it("gives up after the bounded wait so a command-less host still connects", async () => {
    const commands = { list: () => [] };
    let resolved = false;
    void waitForRegisteredCommands(commands, { pollMs: 10, maxWaitMs: 50 }).then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(40);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(resolved).toBe(true); // bounded — never hangs the connect forever
  });
});
