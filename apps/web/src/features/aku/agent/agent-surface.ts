// WI-168 / DR-115 — bindAgentSurface: resolve the flavor's AgentSurfacePolicy
// (EditorModeContext.agent, injected — DR-114 §2b) into the THREE deps the
// reverse-MCP bridge consumes:
//
//   • commands — a read-only CommandRegistry VIEW of the allow-list (the
//     bridge's describeCommands maps `list()` as-is, so the view controls the
//     advertised tool names; a rename exposes the row under exposedName).
//   • schemas — the per-exposed-name argument contracts (the bridge merges
//     deps.schemas LAST, so these win over the kit defaults).
//   • editor — an exec proxy that resolves exposedName → {command, mapInput}
//     and forwards the INTERNAL name + translated input to the wrapped editor.
//     The round-grouping proxy (and its flavor-free input guards: text-box /
//     container / min-size) sits BELOW this one, so guards see the FINAL
//     containerId. An unexposed name fails closed without executing.
//
// Misconfiguration loud-fails ONLY where it is statically decidable:
//   • duplicate exposedName / missing schema → at bind time (both resolve
//     against static inputs — the policy and the catalogue).
//   • an UNREGISTERED command is NOT a runtime loud-fail anywhere: both bind
//     (first-render useMemo) and connect (eager connect-on-init effect) run
//     BEFORE useWeaveEditor's registration effect populates the registry —
//     bind-time validation blanked every page-bounded mount, list()-time
//     validation broke every page-bounded connect (deriveCommandSchemas calls
//     list() synchronously inside connectAgocraftAgent). The view resolves
//     lazily and skips what is not registered YET; enlisted-but-never-
//     registered drift is enforced statically by
//     editor-mode/agent-surface.coverage.test.ts.

import type { AgentCommandSpec } from "@agocraft/agent-client";
import type { Command, CommandRegistry } from "@agocraft/core";
import type { Editor } from "@agocraft/editor";
import type {
  AgentHostContext,
  AgentSurfacePolicy,
  AgentToolAdapter,
} from "../../../document/editor-mode/types.js";

export interface BoundAgentSurface {
  readonly editor: Editor;
  readonly commands: CommandRegistry;
  readonly schemas: Readonly<Record<string, AgentCommandSpec>>;
}

/** Mirrors the editor.exec call the bridge makes (same loose shape the
 *  round-grouping proxy uses — exec's third arg passes through untouched). */
type ExecFn = (commandName: string, input: unknown, opts?: unknown) => unknown;

export function bindAgentSurface(opts: {
  readonly policy: AgentSurfacePolicy;
  /** The editor the bridge would otherwise drive directly (the round-grouping
   *  proxy — its transaction grouping and input guards stay underneath). */
  readonly editor: Editor;
  readonly commands: CommandRegistry;
  readonly baseSchemas: Readonly<Record<string, AgentCommandSpec>>;
  /** Live host values for mapInput — read per exec, never captured. */
  readonly getHost: () => AgentHostContext;
  /** WI-169 — host-side page activation, fired synchronously when an
   *  `activatesPage` adapter execs ok (the value is the new page's id). The
   *  host wires the SAME state updates the rail "+" performs, so agent page
   *  creation and rail page creation cannot drift. Optional: free-placement
   *  flavors never bind it. */
  readonly onPageActivate?: (id: string) => void;
}): BoundAgentSurface {
  const { policy, editor, commands, baseSchemas, getHost, onPageActivate } = opts;

  // "all" = the identity triple: byte-identical to the pre-DR-115 wiring.
  if (policy.tools === "all") {
    return { editor, commands, schemas: baseSchemas };
  }

  // { allExcept } (WI-207 / DR-132) = lazy pass-through MINUS the de-list.
  // Unlike the allow-list below (static names, adapters), this filters the
  // LIVE registry at read time — new commands auto-flow to the agent (free-
  // placement philosophy), the de-listed ones stop being advertised, and a
  // call to a de-listed name fails closed without executing (defence-in-depth
  // with the advertisement filter).
  if (!Array.isArray(policy.tools)) {
    const excluded = new Set((policy.tools as { allExcept: ReadonlyArray<string> }).allExcept);
    const schemas = Object.fromEntries(
      Object.entries(baseSchemas).filter(([name]) => !excluded.has(name)),
    );
    const commandsView: CommandRegistry = {
      register: () => {
        throw new Error("agent-surface: the agent command view is read-only");
      },
      get: <I, O>(name: string) =>
        excluded.has(name) ? undefined : (commands.get(name) as Command<I, O> | undefined),
      has: (name) => !excluded.has(name) && commands.has(name),
      list: () => commands.list().filter((c) => !excluded.has(c.name)),
    };
    const exceptExec: ExecFn = (commandName, input, execOpts) => {
      if (excluded.has(commandName)) {
        return {
          ok: false,
          error: {
            code: "agent-tool-not-exposed",
            message: `"${commandName}" is not part of this design mode's agent surface`,
          },
        };
      }
      return (editor.exec as ExecFn)(commandName, input, execOpts);
    };
    const exceptEditor = new Proxy(editor, {
      get(target, prop, receiver) {
        if (prop === "exec") return exceptExec;
        return Reflect.get(target, prop, receiver);
      },
    }) as Editor;
    return { editor: exceptEditor, commands: commandsView, schemas };
  }

  // Array.isArray does not narrow a ReadonlyArray union's negative branch, so
  // the allow-list shape is re-asserted here (the { allExcept } shape returned
  // above; "all" returned before that).
  const allowList = policy.tools as ReadonlyArray<string | AgentToolAdapter>;
  const adaptersByExposed = new Map<string, AgentToolAdapter>();
  const schemas: Record<string, AgentCommandSpec> = {};

  for (const tool of allowList) {
    const adapter: AgentToolAdapter =
      typeof tool === "string" ? { exposedName: tool, command: tool } : tool;
    if (adaptersByExposed.has(adapter.exposedName)) {
      throw new Error(`agent-surface: duplicate exposedName "${adapter.exposedName}"`);
    }
    const base = baseSchemas[adapter.command];
    const spec = adapter.schema !== undefined ? adapter.schema(base) : base;
    if (spec === undefined) {
      throw new Error(
        `agent-surface: tool "${adapter.exposedName}" has no schema ` +
          `(command "${adapter.command}" is not in the catalogue and the adapter supplies none)`,
      );
    }
    adaptersByExposed.set(adapter.exposedName, adapter);
    schemas[adapter.exposedName] = spec;
  }

  // LAZY command resolution — the live registry is empty when bind runs (first
  // render); it is fully populated by the time the bridge calls list()/get()
  // (connect time). Re-exposing under exposedName spreads the registered
  // command so run/canRun/metadata survive the rename.
  const resolveExposed = (adapter: AgentToolAdapter): Command | undefined => {
    const command = commands.get(adapter.command);
    if (command === undefined) return undefined;
    return adapter.exposedName === adapter.command
      ? command
      : ({ ...command, name: adapter.exposedName } as Command);
  };

  const commandsView: CommandRegistry = {
    register: () => {
      throw new Error("agent-surface: the agent command view is read-only");
    },
    get: <I, O>(name: string) => {
      const adapter = adaptersByExposed.get(name);
      return adapter === undefined
        ? undefined
        : (resolveExposed(adapter) as Command<I, O> | undefined);
    },
    has: (name) => {
      const adapter = adaptersByExposed.get(name);
      return adapter !== undefined && commands.has(adapter.command);
    },
    // list() must NOT throw on an unresolved command: connectAgocraftAgent
    // calls deriveCommandSchemas(commands) → list() SYNCHRONOUSLY at connect,
    // and the eager connect-on-init effect can run BEFORE useWeaveEditor's
    // registration effect — the registry is still empty then (probe-proven;
    // throwing here broke every page-bounded connect). Skipping matches the
    // raw registry's transient-emptiness semantics on free flavors.
    // CAUTION: the bridge's tool advertisement is NOT lazy — createCommandTools
    // materializes describe() ONCE at connect ("Read once per build"), so an
    // empty list() here would be frozen for the connection's whole lifetime.
    // The connect path therefore WAITS for registration before connecting
    // (waitForRegisteredCommands in use-aku-agent.ts) — that guard, not this
    // skip, is what keeps the advertised set complete. Real catalogue drift is
    // owned statically by editor-mode/agent-surface.coverage.test.ts.
    list: () =>
      [...adaptersByExposed.values()]
        .map((adapter) => resolveExposed(adapter))
        .filter((command): command is Command => command !== undefined),
  };

  const surfaceExec: ExecFn = (commandName, input, execOpts) => {
    const adapter = adaptersByExposed.get(commandName);
    if (adapter === undefined) {
      // Fail closed WITHOUT executing — the same CommandResult shape every
      // command returns, so the bridge reports it as a normal tool failure.
      return {
        ok: false,
        error: {
          code: "agent-tool-not-exposed",
          message: `"${commandName}" is not part of this design mode's agent surface`,
        },
      };
    }
    let mapped = input;
    if (adapter.mapInput !== undefined) {
      try {
        mapped = adapter.mapInput(input, getHost());
      } catch {
        mapped = input; // translation must never turn a valid call into a crash
      }
    }
    const result = (editor.exec as ExecFn)(adapter.command, mapped, execOpts);
    // WI-169 — page-creating tools activate the new page SYNCHRONOUSLY at
    // exec (rail-"+" parity). The debounced camera path (useAkuFrameCamera →
    // handleAgentZoomToFrame) is 200ms behind the changeStream — too late for
    // the agent's NEXT omitted-containerId add, which would land on the OLD
    // active page. CommandResult is synchronous, so the ok/value check here
    // never races the exec itself.
    if (adapter.activatesPage === true && onPageActivate !== undefined) {
      const r = result as { ok?: boolean; value?: unknown };
      if (r !== null && typeof r === "object" && r.ok === true && typeof r.value === "string") {
        onPageActivate(r.value);
      }
    }
    return result;
  };

  const surfaceEditor = new Proxy(editor, {
    get(target, prop, receiver) {
      if (prop === "exec") return surfaceExec;
      return Reflect.get(target, prop, receiver);
    },
  }) as Editor;

  return { editor: surfaceEditor, commands: commandsView, schemas };
}
