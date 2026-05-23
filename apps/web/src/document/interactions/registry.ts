import { getBehaviors } from "../agocraft-mirror.js";
import type { AgoItem, InteractionBehavior } from "../types.js";
import type { InteractionAdapter, InteractionRegistry } from "./types.js";

export function createInteractionRegistry(): InteractionRegistry {
  const adapters = new Map<string, InteractionAdapter>();

  function register<B extends InteractionBehavior>(adapter: InteractionAdapter<B>): () => void {
    if (adapters.has(adapter.kind)) {
      console.warn(
        `[interaction-registry] Adapter for kind "${adapter.kind}" already registered. Keeping the first; second call ignored.`,
      );
      return () => undefined;
    }
    adapters.set(adapter.kind, adapter as unknown as InteractionAdapter);
    return () => {
      adapters.delete(adapter.kind);
    };
  }

  function get(kind: InteractionBehavior["kind"]): InteractionAdapter | undefined {
    return adapters.get(kind);
  }

  function list(): ReadonlyArray<InteractionAdapter> {
    return Array.from(adapters.values());
  }

  function forItem(
    item: AgoItem,
    kindFilter?: InteractionBehavior["kind"],
  ): ReadonlyArray<{ behavior: InteractionBehavior; adapter: InteractionAdapter }> {
    const out: { behavior: InteractionBehavior; adapter: InteractionAdapter }[] = [];
    for (const behavior of getBehaviors(item)) {
      if (kindFilter !== undefined && behavior.kind !== kindFilter) continue;
      const adapter = adapters.get(behavior.kind);
      if (adapter === undefined) {
        console.warn(
          `[interaction-registry] No adapter for kind "${behavior.kind}" (behavior id ${behavior.id}). Skipped.`,
        );
        continue;
      }
      out.push({ behavior, adapter });
    }
    return out;
  }

  return { register, get, list, forItem };
}
