// WI-168 / DR-115 — bindAgentSurface façade units: the "all" identity triple
// (free-placement 무회귀), the read-only registry view, bind-time loud-fails,
// and exec routing (adapter resolution / fail-closed block / mapInput
// fallback). Fakes only — no real editor.

import type { AgentCommandSpec } from "@agocraft/agent-client";
import type { Command, CommandRegistry } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import { describe, expect, it } from "vitest";
import type { AgentHostContext, AgentSurfacePolicy } from "../../../document/editor-mode/types.js";
import { bindAgentSurface } from "./agent-surface.js";

const HOST: AgentHostContext = { rootId: "root-1", activeContainerId: "page-1" };

function makeRegistry(names: ReadonlyArray<string>): CommandRegistry {
  const map = new Map<string, Command>(
    names.map((n) => [
      n,
      { name: n, run: () => ({ ok: true, value: n, patches: [] }) } as unknown as Command,
    ]),
  );
  return {
    register: (c) => {
      map.set(c.name, c as Command);
      return () => {};
    },
    get: <I, O>(n: string) => map.get(n) as Command<I, O> | undefined,
    has: (n) => map.has(n),
    list: () => [...map.values()],
  };
}

function makeEditor(): { editor: Editor; calls: Array<{ name: string; input: unknown }> } {
  const calls: Array<{ name: string; input: unknown }> = [];
  const editor = {
    exec: (name: string, input: unknown) => {
      calls.push({ name, input });
      return { ok: true, value: name, patches: [] };
    },
  } as unknown as Editor;
  return { editor, calls };
}

const SCHEMAS: Readonly<Record<string, AgentCommandSpec>> = {
  "weave.a": { label: "a", inputSchema: { type: "object", description: "a" } },
  "weave.b": { label: "b", inputSchema: { type: "object", description: "b" } },
};

describe("bindAgentSurface (WI-168 / DR-115)", () => {
  it('"all" returns the identity triple — free-placement flavors cannot regress', () => {
    const { editor } = makeEditor();
    const commands = makeRegistry(["weave.a", "weave.b"]);
    const bound = bindAgentSurface({
      policy: { tools: "all" },
      editor,
      commands,
      baseSchemas: SCHEMAS,
      getHost: () => HOST,
    });
    expect(bound.editor).toBe(editor);
    expect(bound.commands).toBe(commands);
    expect(bound.schemas).toBe(SCHEMAS);
  });

  it("an allow-list exposes exactly its names (renames included) with their schemas", () => {
    const { editor } = makeEditor();
    const bound = bindAgentSurface({
      policy: {
        tools: [
          "weave.a",
          {
            exposedName: "weave.wrapped",
            command: "weave.b",
            schema: (base) => ({
              ...(base as AgentCommandSpec),
              inputSchema: { type: "object", description: "wrapped" },
            }),
          },
        ],
      },
      editor,
      commands: makeRegistry(["weave.a", "weave.b"]),
      baseSchemas: SCHEMAS,
      getHost: () => HOST,
    });
    expect(bound.commands.list().map((c) => c.name)).toEqual(["weave.a", "weave.wrapped"]);
    expect(bound.commands.has("weave.wrapped")).toBe(true);
    expect(bound.commands.has("weave.b")).toBe(false); // internal name not advertised
    expect(Object.keys(bound.schemas).sort()).toEqual(["weave.a", "weave.wrapped"]);
    expect(bound.schemas["weave.wrapped"]?.inputSchema["description"]).toBe("wrapped");
    // The renamed row keeps the registered command's run (spread re-expose).
    expect(typeof bound.commands.get("weave.wrapped")?.run).toBe("function");
  });

  it("the command view is read-only", () => {
    const { editor } = makeEditor();
    const bound = bindAgentSurface({
      policy: { tools: ["weave.a"] },
      editor,
      commands: makeRegistry(["weave.a"]),
      baseSchemas: SCHEMAS,
      getHost: () => HOST,
    });
    expect(() =>
      bound.commands.register({ name: "x", run: () => ({ ok: true }) } as unknown as Command),
    ).toThrow(/read-only/);
  });

  it("loud-fails at bind time on the STATIC misconfigurations: missing schema / duplicate name", () => {
    const { editor } = makeEditor();
    const commands = makeRegistry(["weave.a", "weave.b", "weave.noschema"]);
    const bind = (policy: AgentSurfacePolicy) =>
      bindAgentSurface({ policy, editor, commands, baseSchemas: SCHEMAS, getHost: () => HOST });
    expect(() => bind({ tools: ["weave.noschema"] })).toThrow(/no schema/);
    expect(() => bind({ tools: ["weave.a", "weave.a"] })).toThrow(/duplicate/);
  });

  it("an unregistered command loud-fails at list() time, NOT bind time", () => {
    // bind runs on first render BEFORE useWeaveEditor registers the command
    // set — throwing there blanked every page-bounded mount (the WI-168 e2e
    // regression). list() runs at connect time, after registration.
    const { editor } = makeEditor();
    const bound = bindAgentSurface({
      policy: { tools: ["weave.missing"] },
      editor,
      commands: makeRegistry(["weave.a"]),
      baseSchemas: { ...SCHEMAS, "weave.missing": SCHEMAS["weave.a"] as AgentCommandSpec },
      getHost: () => HOST,
    });
    expect(() => bound.commands.list()).toThrow(/unregistered command/);
    expect(bound.commands.has("weave.missing")).toBe(false);
    expect(bound.commands.get("weave.missing")).toBeUndefined();
  });

  it("tolerates LATE registration: bind on an empty registry, register, then list() works", () => {
    const { editor } = makeEditor();
    const commands = makeRegistry([]); // first render: nothing registered yet
    const bound = bindAgentSurface({
      policy: { tools: ["weave.a", { exposedName: "weave.wrapped", command: "weave.b" }] },
      editor,
      commands,
      baseSchemas: SCHEMAS,
      getHost: () => HOST,
    });
    // The mount survives; the view simply has no commands yet.
    expect(bound.commands.has("weave.a")).toBe(false);
    // useWeaveEditor's effect registers the set after mount.
    commands.register({ name: "weave.a", run: () => ({ ok: true }) } as unknown as Command);
    commands.register({ name: "weave.b", run: () => ({ ok: true }) } as unknown as Command);
    expect(bound.commands.list().map((c) => c.name)).toEqual(["weave.a", "weave.wrapped"]);
    expect(bound.commands.has("weave.wrapped")).toBe(true);
  });

  it("exec resolves an adapter: internal name + mapped input reach the editor", () => {
    const { editor, calls } = makeEditor();
    const bound = bindAgentSurface({
      policy: {
        tools: [
          {
            exposedName: "weave.wrapped",
            command: "weave.b",
            schema: () => ({ label: "w", inputSchema: { type: "object", description: "w" } }),
            mapInput: (input, host) => ({
              ...(input as Record<string, unknown>),
              containerId: host.activeContainerId,
            }),
          },
        ],
      },
      editor,
      commands: makeRegistry(["weave.b"]),
      baseSchemas: SCHEMAS,
      getHost: () => HOST,
    });
    const result = (bound.editor as unknown as { exec(n: string, i: unknown): unknown }).exec(
      "weave.wrapped",
      { kind: "text" },
    );
    expect(calls).toEqual([{ name: "weave.b", input: { kind: "text", containerId: "page-1" } }]);
    expect((result as { ok: boolean }).ok).toBe(true);
  });

  it("exec fails CLOSED on an unexposed name — nothing executes", () => {
    const { editor, calls } = makeEditor();
    const bound = bindAgentSurface({
      policy: { tools: ["weave.a"] },
      editor,
      commands: makeRegistry(["weave.a", "weave.b"]),
      baseSchemas: SCHEMAS,
      getHost: () => HOST,
    });
    const result = (bound.editor as unknown as { exec(n: string, i: unknown): unknown }).exec(
      "weave.b",
      {},
    ) as { ok: boolean; error?: { code: string } };
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("agent-tool-not-exposed");
    expect(calls).toEqual([]);
  });

  it("a throwing mapInput falls back to the raw input (translation never crashes a call)", () => {
    const { editor, calls } = makeEditor();
    const bound = bindAgentSurface({
      policy: {
        tools: [
          {
            exposedName: "weave.a",
            command: "weave.a",
            mapInput: () => {
              throw new Error("boom");
            },
          },
        ],
      },
      editor,
      commands: makeRegistry(["weave.a"]),
      baseSchemas: SCHEMAS,
      getHost: () => HOST,
    });
    (bound.editor as unknown as { exec(n: string, i: unknown): unknown }).exec("weave.a", {
      x: 1,
    });
    expect(calls).toEqual([{ name: "weave.a", input: { x: 1 } }]);
  });

  it("non-exec editor members pass through the proxy", () => {
    const calls: unknown[] = [];
    const editor = {
      exec: (n: string) => calls.push(n),
      history: { marker: true },
    } as unknown as Editor;
    const bound = bindAgentSurface({
      policy: { tools: ["weave.a"] },
      editor,
      commands: makeRegistry(["weave.a"]),
      baseSchemas: SCHEMAS,
      getHost: () => HOST,
    });
    expect((bound.editor as unknown as { history: unknown }).history).toBe(
      (editor as unknown as { history: unknown }).history,
    );
  });
});
