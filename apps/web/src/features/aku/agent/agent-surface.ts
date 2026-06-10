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
// Misconfiguration loud-fails at the EARLIEST moment it is statically
// decidable (retargetCommandSchemas precedent: loud-fail on missing keys):
//   • duplicate exposedName / missing schema → at bind time (both resolve
//     against static inputs — the policy and the catalogue).
//   • unregistered command → at `list()` time, NOT bind time. bind runs in a
//     useMemo on FIRST render, before useWeaveEditor's effect has registered
//     the command set (the registry starts empty — see the [aku commands]
//     debug effect); the bridge only calls list() at connect time, after
//     registration completes. Validating registration at bind time crashed
//     every page-bounded mount (the WI-168 e2e regression).

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
}): BoundAgentSurface {
  const { policy, editor, commands, baseSchemas, getHost } = opts;

  // "all" = the identity triple: byte-identical to the pre-DR-115 wiring, so
  // free-placement flavors (mixed / canvas-board) cannot regress.
  if (policy.tools === "all") {
    return { editor, commands, schemas: baseSchemas };
  }

  const adaptersByExposed = new Map<string, AgentToolAdapter>();
  const schemas: Record<string, AgentCommandSpec> = {};

  for (const tool of policy.tools) {
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
    // list() is the bridge's tool advertisement — by connect time registration
    // is complete, so a hole here is real catalogue drift: scream.
    list: () =>
      [...adaptersByExposed.values()].map((adapter) => {
        const command = resolveExposed(adapter);
        if (command === undefined) {
          throw new Error(
            `agent-surface: tool "${adapter.exposedName}" wraps unregistered command "${adapter.command}"`,
          );
        }
        return command;
      }),
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
    return (editor.exec as ExecFn)(adapter.command, mapped, execOpts);
  };

  const surfaceEditor = new Proxy(editor, {
    get(target, prop, receiver) {
      if (prop === "exec") return surfaceExec;
      return Reflect.get(target, prop, receiver);
    },
  }) as Editor;

  return { editor: surfaceEditor, commands: commandsView, schemas };
}
